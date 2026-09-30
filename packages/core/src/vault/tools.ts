import { z } from 'zod';
import { type McpTool, type McpToolResult, toolText } from '../lib/mcp-server.js';
import { MesaError } from '../lib/result.js';
import type { Recorded } from '../receipts/recorder.js';
import { projectScope } from '../sessions/general.js';
import type { SessionRecord } from '../sessions/record.js';
import type { ProjectContext } from './project-context.js';
import type { VaultRead } from './reader.js';
import { DEFAULT_VAULT_SEARCH_LIMIT, type VaultSearch, type VaultSearchFilter } from './search.js';
import { DEFAULT_GOALS, type SessionGoal } from './session-goals.js';
import type { DecisionInput, NoteInput, Saved, SummaryInput } from './session-writes.js';

// The mesa-vault tools (ADR-0011, CONTEXT.md Vault server). Every provider pays for their list, so
// each has one line and a small schema. Each calls the owner its `mesa vault` command calls, for
// the bound session and its project, and answers with that command's --json data.

/** The vault owners the tools call, as the vault service holds them. */
export type VaultOwners = {
  context: (project: string, options: { exclude: string }) => ProjectContext;
  read: (path: string) => VaultRead;
  search: (text: string, filter?: VaultSearchFilter) => VaultSearch;
  goals: (project: string, options: { limit?: number; exclude: string }) => SessionGoal[];
  saveDecision: (input: DecisionInput) => Promise<Recorded<Saved>>;
  saveSummary: (input: SummaryInput) => Promise<Recorded<Saved>>;
  saveNote: (input: NoteInput) => Promise<Recorded<Saved>>;
};

type Tool = {
  name: string;
  description: string;
  input: z.ZodObject;
  call: (owners: VaultOwners, session: SessionRecord, args: unknown) => unknown;
};

/** A tool whose call sees its arguments as its schema parsed them. */
const tool = <S extends z.ZodObject>(spec: {
  name: string;
  description: string;
  input: S;
  call: (owners: VaultOwners, session: SessionRecord, args: z.infer<S>) => unknown;
}): Tool => spec as unknown as Tool;

/** A save's result as `mesa vault save --json` prints it: where, whether it changed, the receipt. */
const saved = async (recorded: Promise<Recorded<Saved>>) => {
  const { result, receipt, warning } = await recorded;
  return { ...result, receipt, ...(warning ? { warning } : {}) };
};

/** The bound session's project; a General session has none to save a decision for. */
function projectOf(session: SessionRecord): string {
  const project = projectScope(session.project);
  if (!project) throw new MesaError('usage', 'a General session has no project to save it for');
  return project;
}

const unit = z.number().min(0).max(1);

// Reads default to the session's project (General: the whole vault), and leave the session out.
const TOOLS: Tool[] = [
  tool({
    name: 'project_context',
    description:
      "This project's overview: hub, index, notes, decisions, earlier goals. Call first.",
    input: z.strictObject({ project: z.string().optional().describe('Another project instead') }),
    call: (owners, session, { project }) =>
      owners.context(project ?? session.project, { exclude: session.id }),
  }),
  tool({
    name: 'read_note',
    description: 'Read a vault item by vault-relative path: properties, body, links, backlinks.',
    input: z.strictObject({
      path: z.string().describe('Vault-relative path, e.g. projects/<project>.md'),
    }),
    call: (owners, _session, { path }) => owners.read(path),
  }),
  tool({
    name: 'search_vault',
    description: "Find vault items holding every word; this session's project unless all.",
    input: z.strictObject({
      query: z.string().describe('Words to find'),
      project: z.string().optional().describe('Another project instead'),
      all: z.boolean().optional().describe('Search the whole vault'),
      limit: z.number().int().min(1).max(DEFAULT_VAULT_SEARCH_LIMIT).optional(),
    }),
    call: (owners, session, { query, project, all, limit }) =>
      owners.search(query, {
        project: all ? undefined : (project ?? projectScope(session.project)),
        limit,
      }),
  }),
  tool({
    name: 'session_goals',
    description: "Earlier sessions' goals on this project, newest first.",
    input: z.strictObject({ limit: z.number().int().min(1).max(DEFAULT_GOALS).optional() }),
    call: (owners, session, { limit }) =>
      owners.goals(session.project, { limit, exclude: session.id }),
  }),
  tool({
    name: 'save_decision',
    description: 'Save a decision and its rationale in wiki/decisions/.',
    input: z.strictObject({
      title: z.string().describe('Short name'),
      decision: z.string().describe('What was decided'),
      rationale: z.string().describe('Why'),
      probabilities: z
        .record(z.string(), unit)
        .optional()
        .describe('Probability per option, from mesa decide'),
      confidence: unit.optional().describe('Confidence, from mesa decide'),
    }),
    call: (owners, session, args) =>
      saved(owners.saveDecision({ ...args, project: projectOf(session), session: session.id })),
  }),
  tool({
    name: 'save_summary',
    description: "Save this session's summary (Goal, Done, Assumed, Left, Decisions).",
    input: z.strictObject({ summary: z.string().describe('Markdown summary') }),
    call: (owners, session, { summary }) =>
      saved(owners.saveSummary({ session: session.id, summary })),
  }),
  tool({
    name: 'save_note',
    description: 'Save a note in wiki/notes/, or at a path under wiki/ or projects/<project>/.',
    input: z.strictObject({
      title: z.string().describe('Note title'),
      body: z.string().describe('Markdown body'),
      path: z.string().optional().describe('Instead of wiki/notes/<slug>.md'),
    }),
    call: (owners, session, args) =>
      saved(
        owners.saveNote({ ...args, project: projectScope(session.project), session: session.id }),
      ),
  }),
];

/** The definitions a bound server lists: fixed, whatever the vault holds. */
export const VAULT_TOOLS: McpTool[] = TOOLS.map(({ name, description, input }) => {
  const { $schema: _, ...inputSchema } = z.toJSONSchema(input);
  return { name, description, inputSchema };
});

/** Why arguments do not fit a tool's schema, one issue after another. */
const misfit = (error: z.ZodError) =>
  error.issues.map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`).join('; ');

/**
 * Calls the tool `name` for `session` with `args` as the agent sent them: its answer as JSON text,
 * or a tool error (arguments its schema refuses, or the owner's refusal); undefined for no tool.
 */
export async function callVaultTool(
  owners: VaultOwners,
  session: SessionRecord,
  name: string,
  args: unknown,
): Promise<McpToolResult | undefined> {
  const found = TOOLS.find((t) => t.name === name);
  if (!found) return undefined;
  const parsed = found.input.safeParse(args);
  if (!parsed.success) return toolText(`${name}: ${misfit(parsed.error)}`, true);
  try {
    return toolText(JSON.stringify(await found.call(owners, session, parsed.data)));
  } catch (error) {
    return toolText(error instanceof Error ? error.message : String(error), true);
  }
}
