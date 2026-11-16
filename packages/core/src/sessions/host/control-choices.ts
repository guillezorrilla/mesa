// What a Structured session's model, effort and mode pickers show (#1222): each choice's id, the
// name a person reads, and a line on what it does. The one owner of those names, for Claude Code
// and Codex alike; the app and `mesa sessions controls` read them from here.

/** One entry of a picker: what Mesa sends, and what a person reads. */
export type ControlChoice = { id: string; label: string; description?: string };

/**
 * Claude's main models, as Claude Desktop lists them. shortcut: names as of Claude Code 2.1.325;
 * update them with each model release (Claude's /model lists aliases, not names).
 */
const CLAUDE_MODELS: ControlChoice[] = [
  { id: 'opus', label: 'Opus 5.5' },
  { id: 'fable', label: 'Fable 5.2' },
  { id: 'sonnet', label: 'Sonnet 5.5' },
  { id: 'haiku', label: 'Haiku 5.5' },
];
/** The rest Claude Code takes by name, under More models. */
const CLAUDE_MORE_MODELS: ControlChoice[] = [
  { id: 'opus[1m]', label: 'Opus 5.5 (1M context)' },
  { id: 'sonnet[1m]', label: 'Sonnet 5.5 (1M context)' },
  { id: 'best', label: 'Best available' },
  { id: 'opusplan', label: 'Opus in plan mode, Sonnet otherwise' },
];

const EFFORT_LABELS: Record<string, string> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra',
  max: 'Max',
};

/** Claude Code's permission modes as Claude Desktop names them, in its order. */
const CLAUDE_MODES: ControlChoice[] = [
  { id: 'auto', label: 'Auto', description: 'Claude handles permission decisions' },
  { id: 'manual', label: 'Manual', description: 'Always ask before making changes' },
  { id: 'acceptEdits', label: 'Accept edits', description: 'Automatically accept all file edits' },
  { id: 'plan', label: 'Plan', description: 'Create a plan before making changes' },
  { id: 'bypassPermissions', label: 'Bypass permissions', description: 'Accepts all permissions' },
];

/** Codex's approval presets, as its /approvals names them: an approval policy and a sandbox. */
export const CODEX_PRESETS = [
  {
    id: 'read-only',
    label: 'Read only',
    description: 'Reads files and answers; asks before editing, running commands or going online',
    approvalPolicy: 'on-request',
    sandbox: 'readOnly',
  },
  {
    id: 'auto',
    label: 'Auto',
    description: 'Edits and runs commands in the workspace; asks before leaving it or going online',
    approvalPolicy: 'on-request',
    sandbox: 'workspaceWrite',
  },
  {
    id: 'full-access',
    label: 'Full access',
    description: 'Edits, runs commands and goes online without asking',
    approvalPolicy: 'never',
    sandbox: 'dangerFullAccess',
  },
] as const;

export const CODEX_PRESET_IDS = ['read-only', 'auto', 'full-access'] as const;
export type CodexPreset = (typeof CODEX_PRESET_IDS)[number];
export const isCodexPreset = (mode: string): mode is CodexPreset =>
  (CODEX_PRESET_IDS as readonly string[]).includes(mode);

/** The preset an approval policy and sandbox make; none for a mix no preset is. */
export const codexPreset = (approvalPolicy?: string, sandbox?: string) =>
  CODEX_PRESETS.find((p) => p.approvalPolicy === approvalPolicy && p.sandbox === sandbox)?.id;

/** The modes each agent offers, the risky one only to a session that started with it. */
export function agentModes(agent: 'claude' | 'codex', started?: string): string[] {
  const risky = agent === 'claude' ? 'bypassPermissions' : 'full-access';
  const all = agent === 'claude' ? CLAUDE_MODES.map((m) => m.id) : CODEX_PRESETS.map((p) => p.id);
  return all.filter((mode) => mode !== risky || started === risky);
}

/** What a session's pickers need of its controls (SessionControls). */
type Controls = {
  agent: 'claude' | 'codex';
  models: string[];
  efforts: readonly string[];
  modes: readonly string[];
  /** Codex's names for its models, from its model list. */
  modelLabels?: Record<string, string>;
};

/** A model's name; an alias or id Mesa has no name for, as it is. */
export function modelChoiceLabel(controls: Pick<Controls, 'agent' | 'modelLabels'>, id: string) {
  if (controls.agent === 'codex') return controls.modelLabels?.[id] ?? id;
  return [...CLAUDE_MODELS, ...CLAUDE_MORE_MODELS].find((m) => m.id === id)?.label ?? id;
}

/** An effort as a person reads it: `xhigh` as Extra. */
export const effortLabel = (effort: string) => EFFORT_LABELS[effort] ?? effort;

/** A mode as a person reads it, with what it does. */
export function modeChoice(agent: 'claude' | 'codex', id: string): ControlChoice {
  const all: readonly ControlChoice[] = agent === 'claude' ? CLAUDE_MODES : CODEX_PRESETS;
  return all.find((m) => m.id === id) ?? { id, label: id };
}

/**
 * A session's pickers: its main models (Claude's four, or Codex's first four), the rest under More
 * models, its efforts and its modes, each with the name a person reads.
 */
export function controlChoices(controls: Controls) {
  const named = (id: string) => ({ id, label: modelChoiceLabel(controls, id) });
  const claude = controls.agent === 'claude';
  const main = claude
    ? CLAUDE_MODELS.filter((m) => controls.models.includes(m.id))
    : controls.models.slice(0, 4).map(named);
  const more = claude ? CLAUDE_MORE_MODELS : controls.models.slice(4).map(named);
  return {
    models: main,
    more,
    efforts: controls.efforts.map((id) => ({ id, label: effortLabel(id) })),
    modes: controls.modes.map((id) => modeChoice(controls.agent, id)),
  };
}
