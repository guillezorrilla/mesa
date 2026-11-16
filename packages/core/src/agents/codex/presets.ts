// Codex's approval presets (#1222): an approval policy and a sandbox under one name, as Codex's
// /approvals offers them. Mesa sets one from its next turn (appserver/runner.ts) and its picker
// names them (sessions/host/control-choices.ts).

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

export type CodexPreset = (typeof CODEX_PRESETS)[number]['id'];
/** The presets' ids, for a schema that takes one. */
export const CODEX_PRESET_IDS = CODEX_PRESETS.map((p) => p.id) as [CodexPreset, ...CodexPreset[]];
export const isCodexPreset = (mode: string): mode is CodexPreset =>
  (CODEX_PRESET_IDS as readonly string[]).includes(mode);

/** The preset an approval policy and sandbox make; none for a mix no preset is. */
export const codexPreset = (approvalPolicy?: string, sandbox?: string) =>
  CODEX_PRESETS.find((p) => p.approvalPolicy === approvalPolicy && p.sandbox === sandbox)?.id;
