// The public interface of @mesa/core: the composition root, the real implementations of its
// seams, the result envelope, and the data types callers render. Everything else is internal.
export { AGENT_NAMES, type Agent, DEFAULT_AGENT } from './agents/agents.js';
export type { ClaudeHooksStatus, HooksStatus } from './agents/claude/hooks.js';
export type { CommandReference } from './command-reference.js';
export type { Decision } from './decisions/types.js';
export {
  attentionScore,
  contextPercent,
  duration,
  isRun,
  listPrice,
  NO_OUTPUT_LOG,
  percent,
  sessionBranch,
  sessionCount,
  sessionLabel,
  waitingOn,
} from './display.js';
export type { Check, DoctorReport } from './doctor.js';
export { type Clock, systemClock } from './lib/clock.js';
export { type IdSource, ulidSource } from './lib/ids.js';
export { type Env, execRunner, type Runner } from './lib/process.js';
export * from './lib/result.js';
export { createMesa, type Mesa, type MesaDeps } from './mesa.js';
export { type Config, TERMINAL_APPS } from './profile/config.js';
export { type ProfileInfo, resolveProfileName } from './profile/profile.js';
export type { Project } from './projects/project-file.js';
export type { ProjectRow } from './projects/projects.js';
export type { Recorded } from './receipts/recorder.js';
export { DEFAULT_RECEIPT_LIMIT, type ReceiptEntry } from './receipts/store.js';
export type { Attached } from './sessions/attach.js';
export type { ForeignRow, ManagedRow, SessionRow } from './sessions/board/rows.js';
export type { TreeRow } from './sessions/board/tree.js';
export type { SessionLog } from './sessions/output-log.js';
export type { SessionRecord } from './sessions/record.js';
export type { Removed } from './sessions/remove.js';
export type { HeadlessResult } from './sessions/run.js';
export type { Sent } from './sessions/send.js';
export type { SessionState } from './sessions/states.js';
export type { StopOutcome } from './sessions/stop.js';
export type { TmuxWindow } from './sessions/tmux/format.js';
export type { Viewed } from './sessions/view.js';
export type { SkillRow, SkillSync } from './skills/sync.js';
export { macObsidianPaths, type ObsidianPaths, type Opened } from './vault/obsidian.js';
export type { VaultStatus } from './vault/vault.js';
