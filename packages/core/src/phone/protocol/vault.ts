// What the phone reads of the vault (CONTEXT.md, Vault; #1068): the projects, one project's
// context and earlier goals, Vault search, one note through the Vault reader, the day's digest
// (Daily, Impact, Weekly Rewind), and saving a decision, the one write. rpc.ts adds these calls to
// phoneCall and their results.
import { z } from 'zod';

/** A registered project as the phone lists it. */
export const phoneProject = z.object({ name: z.string(), label: z.string() });

/** A note's link as written (`[[tide|tides]]`) and the vault path it resolves to. */
export const phoneLink = z.object({ text: z.string(), path: z.string() });

/** One vault item as the phone's reader shows it: Markdown and its resolved links. */
export const phoneNote = z.object({
  path: z.string(),
  title: z.string(),
  /** Its Markdown, without frontmatter, cut to NOTE_CHARS; empty when `unsupported` says why. */
  body: z.string(),
  links: z.array(phoneLink),
  clipped: z.boolean(),
  unsupported: z.string().optional(),
});
export type PhoneNote = z.infer<typeof phoneNote>;

/** A project's overview (core's ProjectContext), cut for a phone. */
export const phoneMemory = z.object({
  project: z.string(),
  /** The start of its hub, `projects/<name>.md`, as Markdown with its links. */
  hub: phoneNote.nullable(),
  decisions: z.array(z.object({ title: z.string(), path: z.string(), when: z.string() })),
  notes: z.array(z.object({ title: z.string(), path: z.string(), modified: z.string() })),
  /** Its earlier sessions, newest first; `summary` is their summary note's path. */
  goals: z.array(
    z.object({
      id: z.string(),
      started: z.string(),
      goal: z.string().optional(),
      summary: z.string().optional(),
    }),
  ),
});
export type PhoneMemory = z.infer<typeof phoneMemory>;

/** One Vault search hit: its title, path and first matching line. */
export const phoneHit = z.object({
  path: z.string(),
  title: z.string(),
  project: z.string().optional(),
  line: z.string().optional(),
});
export type PhoneHit = z.infer<typeof phoneHit>;

/** The day's digest: today's Daily note as last built, Impact today, and the Weekly Rewind. */
export const phoneToday = z.object({
  date: z.string(),
  daily: phoneNote.nullable(),
  impact: z.object({
    sentence: z.string(),
    caught: z.number(),
    kept: z.number(),
    notesIn: z.number(),
    stopped: z.number(),
  }),
  rewind: z.object({
    from: z.string(),
    through: z.string(),
    notes: z.array(z.object({ kind: z.string(), summary: z.string(), path: z.string() })),
    /** How many sessions ended in the week. */
    ended: z.number(),
    costUsd: z.number().nullable(),
    missing: z.array(z.string()),
  }),
});
export type PhoneToday = z.infer<typeof phoneToday>;

/** A decision saved in `wiki/decisions/`, and its receipt; none when the same save added nothing. */
export const phoneSaved = z.object({
  path: z.string(),
  changed: z.boolean(),
  receipt: z.string().nullable(),
});
export type PhoneSaved = z.infer<typeof phoneSaved>;

/** The vault's calls, which rpc.ts adds to phoneCall. */
export const vaultCalls = [
  z.object({ method: z.literal('projects') }),
  z.object({ method: z.literal('project'), name: z.string() }),
  z.object({ method: z.literal('vaultSearch'), text: z.string().min(1).max(200) }),
  z.object({ method: z.literal('vaultNote'), path: z.string() }),
  z.object({ method: z.literal('today') }),
  z.object({
    method: z.literal('decide'),
    project: z.string(),
    title: z.string().max(200),
    decision: z.string().max(4000),
    rationale: z.string().max(4000),
  }),
] as const;

/** Each vault call's result, which rpc.ts adds to callResults. */
export const vaultResults = {
  projects: z.object({ projects: z.array(phoneProject) }),
  project: phoneMemory,
  vaultSearch: z.object({ total: z.number(), hits: z.array(phoneHit) }),
  vaultNote: phoneNote,
  today: phoneToday,
  decide: phoneSaved,
};
