// The public interface of @mesa/core: the composition root, the real implementations of its
// seams, the result envelope, and the data types callers render. Everything else is internal.

export type { ClaudeHooksStatus } from './agents/claude/hooks.js';
export type { CodexHooksStatus } from './agents/codex/hooks.js';
export type { HooksStatus } from './agents/hooks-service.js';
export type { AgentCapabilityReport } from './agents/names.js';
export {
  AGENT_CAPABILITIES,
  AGENT_EXECUTABLES,
  AGENT_NAMES,
  type Agent,
  type AgentCapability,
  agentCapabilityReport,
  DEFAULT_AGENT,
  supportsAgentCapability,
  supportsPlanStart,
} from './agents/names.js';
export type { CommandReference } from './command-reference.js';
export type { DailyResult } from './daily/service.js';
export type { GuardrailCheck, Override, Verdict } from './decisions/guardrail.js';
export type { Decision } from './decisions/types.js';
export type { DiagnosticEvent, DiagnosticReport } from './diagnostics/service.js';
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
export type { FileEntry, FileHit, FileSearch, FileTree } from './files/browse.js';
export type { FileChange, WorkspaceFile } from './files/editor.js';
export type { FileLink } from './files/link.js';
export type { GitBranch, GitBranchAction } from './git/branches.js';
export type { GitCommit, GitPathAction } from './git/changes.js';
export type { Checkout } from './git/checkout.js';
export type { DiffRow, GitDiff } from './git/diff.js';
export type { GhState } from './git/gh.js';
export type { GitComparison, GitGraph, GitGraphCommit, GitGraphRow } from './git/history.js';
export type { RepositoryInsight } from './git/insight.js';
export type {
  PrEventDelivery,
  PrEventList,
  PrEventsDelivered,
} from './git/pr-event-delivery.js';
export type { PrEvent, PrProblem } from './git/pr-events.js';
export type { StashAction, StashCreated, StashEntry } from './git/stash.js';
export type { GitChange, GitStatus } from './git/status.js';
export type { GitSync, GitTracking } from './git/sync.js';
export { type Clock, systemClock } from './lib/clock.js';
export { type IdSource, ulidSource } from './lib/ids.js';
export type { McpTool, Stdio } from './lib/mcp-server.js';
export { type Env, execRunner, type Runner } from './lib/process.js';
export * from './lib/result.js';
export type { MapSaved } from './map/service.js';
export { createMesa, type Mesa, type MesaDeps } from './mesa.js';
export type { DeliveryPlan, InboxFix, InboxItem } from './notifications/inbox.js';
export { type Config, TERMINAL_APPS } from './profile/config.js';
export { type ProfileInfo, resolveProfileName } from './profile/profile.js';
export {
  DEFAULT_SHORTCUTS,
  type Shortcuts,
  shortcutFromKeys,
  validShortcut,
} from './profile/shortcuts.js';
export type { DiscoveredProject } from './projects/discover.js';
export type { Project } from './projects/project-file.js';
export { repositoryUrl } from './projects/project-url.js';
export type { ProjectRow } from './projects/projects.js';
export { PROJECT_SORTS, type ProjectSort } from './projects/sort.js';
export type { SavedPrompt } from './prompts/prompts.js';
export { RECORD_KINDS } from './receipts/policy.js';
export { RECEIPT_TYPES } from './receipts/receipt-file.js';
export type { Recorded } from './receipts/recorder.js';
export { DEFAULT_RECEIPT_LIMIT, type ReceiptEntry } from './receipts/store.js';
export type { RuleRow } from './rules/inventory.js';
export { type SearchHit, searchWorkspace } from './search/search.js';
export type { Attached } from './sessions/attach.js';
export type { ForeignRow, ManagedRow, SessionRow } from './sessions/board/rows.js';
export type { TreeRow } from './sessions/board/tree.js';
export type {
  BrowserAnnotationInput,
  BrowserAnnotationPreview,
  BrowserPageSelection,
} from './sessions/browser-annotation.js';
export type {
  ChangeReview,
  ChangeReviewInput,
  ChangeReviewPreview,
} from './sessions/change-review.js';
export type { DescendantResult } from './sessions/descendants.js';
export { GENERAL_PROJECT, projectLabel } from './sessions/general.js';
export type { GridGroup } from './sessions/grid-groups.js';
export type { NativeHistory, NativeHistoryRow } from './sessions/history.js';
export type { SessionImage } from './sessions/images.js';
export type { InstructionStatus } from './sessions/instructions.js';
export type { SessionLog } from './sessions/output-log.js';
export {
  BOARD_DENSITIES,
  BOARD_GROUPS,
  BOARD_SORTS,
  BOARD_VIEWS,
  type BoardPreferences,
  DEFAULT_BOARD_PREFERENCES,
  type PresentationGroup,
  presentSessions,
} from './sessions/presentation.js';
export type { SessionRecord } from './sessions/record.js';
export type { Removed } from './sessions/remove.js';
export type {
  NativeResponse,
  ResponseReviewPreview,
  SessionResponses,
} from './sessions/responses.js';
export type { ReviewDelivery, SavedReview } from './sessions/reviews.js';
export type { HeadlessResult } from './sessions/run.js';
export type { ConversationHit, ConversationSearch } from './sessions/search.js';
export type { Sent } from './sessions/send.js';
export type { SessionState } from './sessions/states.js';
export type { StopOutcome } from './sessions/stop.js';
export type { TmuxWindow } from './sessions/tmux/format.js';
export type { Viewed } from './sessions/view.js';
export { WORKFLOW_STATUSES, type WorkflowStatus } from './sessions/workflow-status.js';
export type { Worktree } from './sessions/worktree.js';
export type { SkillInventoryRow } from './skills/inventory.js';
export type { SkillRow, SkillSync } from './skills/sync.js';
export type {
  UsageBreakdown,
  UsageRecord,
  UsageReport,
  UsageTotals,
} from './usage/records.js';
export type { WeeklyRewind } from './usage/rewind.js';
export type { BasesWritten } from './vault/bases.js';
export type { CanvasData, CanvasEdge, CanvasNode } from './vault/canvas.js';
export type { VaultInventory } from './vault/inventory.js';
export {
  type Unavailable,
  VAULT_CATEGORIES,
  VAULT_KINDS,
  type VaultCategory,
  type VaultFilter,
  type VaultItem,
  type VaultKind,
} from './vault/item.js';
export type { LinkResolution, NoteLink, VaultLink } from './vault/links.js';
export { macObsidianPaths, type ObsidianPaths, type Opened } from './vault/obsidian.js';
export type { ProjectContext } from './vault/project-context.js';
export type { VaultPreview, VaultRead } from './vault/reader.js';
export {
  DEFAULT_VAULT_SEARCH_LIMIT,
  type VaultHit,
  type VaultMatch,
  type VaultSearch,
  type VaultSearchFilter,
} from './vault/search.js';
export { DEFAULT_GOALS, type SessionGoal } from './vault/session-goals.js';
export type { DecisionInput, NoteInput, Saved, SummaryInput } from './vault/session-writes.js';
export type { VaultStatus } from './vault/vault.js';
export {
  describePending,
  type PendingScripts,
  trustCommand,
} from './worktrees/approval.js';
export type { WorktreeDetails } from './worktrees/details.js';
export type { WorktreeFilter, WorktreeRow } from './worktrees/inventory.js';
export type { WorktreeAction, WorktreePreview } from './worktrees/lifecycle.js';
