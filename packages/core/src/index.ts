// The public interface of @mesa/core: the composition root, the real implementations of its
// seams, the result envelope, and the data types callers render. Everything else is internal.

export type { About, Attribution } from './about/about.js';
export type { ClaudeHooksStatus } from './agents/claude/hooks.js';
export type { CodexHooksStatus } from './agents/codex/hooks.js';
export type { HooksStatus } from './agents/hooks-service.js';
export { HOOKS_UPDATE_HINT } from './agents/hooks-update.js';
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
export { describeAutomation } from './automations/describe.js';
export type { AutomationRule } from './automations/schema.js';
export type { AutomationStatus } from './automations/service.js';
export type { AutomationRun, AutomationTrigger } from './automations/state.js';
export type { CommandReference } from './command-reference.js';
export type { DailyResult } from './daily/service.js';
export type { ScopedContext } from './decisions/context.js';
export type { AssistMode, Evaluation } from './decisions/evaluate.js';
export type { GuardrailCheck, Override, Verdict } from './decisions/guardrail.js';
export type { KeyProvider, KeyRow } from './decisions/keys.js';
export { measuredText, type SiteMeasure } from './decisions/measured.js';
export type { Advice, DecisionAnswer } from './decisions/request.js';
export type { DecisionAssistance, DecisionStatus } from './decisions/service.js';
export type { DecisionUse } from './decisions/session-decisions.js';
export type { SiteMode } from './decisions/site-mode.js';
export type { Placed } from './decisions/supervision.js';
export type { Decision, DecisionsModel } from './decisions/types.js';
export type { DiagnosticEvent, DiagnosticReport } from './diagnostics/service.js';
export type { Check, DoctorReport } from './doctor/doctor.js';
export type { FileEntry, FileHit, FileSearch, FileTree } from './files/browse.js';
export type { FileChange, WorkspaceFile } from './files/editor.js';
export type { FileLink } from './files/link.js';
export type { GitBranch, GitBranchAction } from './git/branches.js';
export type { GitCommit, GitPathAction } from './git/changes.js';
export type { DiffRow, GitDiff } from './git/diff.js';
export type { GhState } from './git/gh.js';
export type { GitComparison, GitGraph, GitGraphCommit, GitGraphRow } from './git/history.js';
export type { RepositoryInsight } from './git/insight.js';
export type { StashAction, StashCreated, StashEntry } from './git/stash.js';
export type { GitChange, GitStatus } from './git/status.js';
export type { GitSync, GitTracking } from './git/sync.js';
export type { InstructionRow } from './instructions/inventory.js';
export { type Clock, systemClock } from './lib/clock.js';
export { counted, duration, listPrice, odds, percent, usd } from './lib/format.js';
export type { Http } from './lib/http.js';
export { type IdSource, ulidSource } from './lib/ids.js';
export { type Env, envRunner, type Runner } from './lib/process.js';
export * from './lib/result.js';
export { keychainStore, type SecretStore } from './lib/secret-store.js';
export { localDay } from './lib/time.js';
export type { MapSaved } from './map/service.js';
export { createMesa, type Mesa, type MesaDeps } from './mesa.js';
export type { NotificationDelivery } from './notifications/background.js';
export type { DeliveryPlan } from './notifications/delivery-plan.js';
export type { InboxFix, InboxItem } from './notifications/inbox-items.js';
export type {
  PrEventDelivery,
  PrEventList,
  PrEventsDelivered,
} from './pr-events/pr-event-delivery.js';
export type { PrEvent, PrProblem } from './pr-events/pr-events.js';
export { type Config, TERMINAL_APPS } from './profile/config.js';
export { profilesDir } from './profile/paths.js';
export { type ProfileInfo, resolveProfileName } from './profile/profile.js';
export type { ProfileRow } from './profile/profiles.js';
export {
  DEFAULT_SHORTCUTS,
  type Shortcuts,
  shortcutFromKeys,
  validShortcut,
} from './profile/shortcuts.js';
export type { Checkout } from './projects/checkout.js';
export type { DiscoveredProject } from './projects/discover.js';
export type { Project } from './projects/project-file.js';
export { repositoryUrl } from './projects/project-url.js';
export type { ProjectRow } from './projects/projects.js';
export { PROJECT_SORTS, type ProjectSort } from './projects/sort.js';
export {
  describePending,
  type PendingScripts,
  trustCommand,
} from './projects/trust.js';
export type { SavedPrompt } from './prompts/prompts.js';
export { RECORD_KINDS } from './receipts/policy.js';
export type { Recorded } from './receipts/recorder.js';
export { DEFAULT_RECEIPT_LIMIT, type ReceiptEntry } from './receipts/store.js';
export { type SearchHit, searchWorkspace } from './search/search.js';
export type { ForeignRow, ManagedRow, SessionRow } from './sessions/board/rows.js';
export type { TreeRow } from './sessions/board/tree.js';
export type { DescendantResult } from './sessions/end/descendants.js';
export type { Removed } from './sessions/end/remove.js';
export type { StopOutcome } from './sessions/end/stop.js';
export type {
  BrowserAnnotationInput,
  BrowserAnnotationPreview,
  BrowserPageSelection,
} from './sessions/input/browser-annotation.js';
export type {
  ChangeReview,
  ChangeReviewInput,
  ChangeReviewPreview,
} from './sessions/input/change-review.js';
export type { SessionImage } from './sessions/input/images.js';
export type { ReviewDelivery, SavedReview } from './sessions/input/reviews.js';
export type { Sent } from './sessions/input/send.js';
export type {
  DecisionDeliveryStatus,
  DeliveryStatus,
} from './sessions/native/decision-status.js';
export {
  DISCOVERY_DAYS,
  type NativeConversation,
  type NativeDiscovery,
  type NativeLive,
  type NativeProject,
} from './sessions/native/discovery.js';
export type { NativeHistory, NativeHistoryRow } from './sessions/native/history.js';
export type { InstructionStatus } from './sessions/native/instructions.js';
export type {
  NativeResponse,
  ResponseReviewPreview,
  SessionResponses,
} from './sessions/native/responses.js';
export type { ConversationHit, ConversationSearch } from './sessions/native/search.js';
export type { EachResult, ItemResult } from './sessions/record/each.js';
export { GENERAL_PROJECT, projectLabel } from './sessions/record/general.js';
export {
  additionalLabel,
  attentionScore,
  contextPercent,
  isRun,
  NO_OUTPUT_LOG,
  sessionBranch,
  sessionCount,
  sessionLabel,
  waitingOn,
} from './sessions/record/labels.js';
export type { SessionRecord } from './sessions/record/record.js';
export type { SessionState } from './sessions/record/states.js';
export { WORKFLOW_STATUSES, type WorkflowStatus } from './sessions/record/workflow-status.js';
export type { HeadlessResult } from './sessions/run/files.js';
export type { Supervision } from './sessions/signals/placements.js';
export type { DiscoveredAdoption, DiscoveryAdoption } from './sessions/start/discovery-adopt.js';
export type { Worktree } from './sessions/start/worktree.js';
export type { TmuxWindow } from './sessions/tmux/format.js';
export type { Attached } from './sessions/window/attach.js';
export type { GridGroup } from './sessions/window/grid-groups.js';
export type { SessionLog } from './sessions/window/output-log.js';
export type { Viewed } from './sessions/window/view.js';
export type { SkillInventoryRow } from './skills/inventory.js';
export type { SkillRow, SkillSync } from './skills/sync.js';
export { type BrowseChild, type BrowseResult, DESCENDANTS_CAP } from './sources/browse.js';
export { type CallbackListen, loopbackListener } from './sources/callback-listener.js';
export type { Account, Site } from './sources/connection.js';
export { siteNames } from './sources/describe.js';
export type { ImportedItem, ImportResult, RefreshOptions } from './sources/import.js';
export type { ImportListRow } from './sources/import-service.js';
export type { ItemSource } from './sources/items.js';
export type { JiraIssue } from './sources/jira.js';
export type { Board, Filter } from './sources/jira-tickets.js';
export type { SourceRow } from './sources/service.js';
export type { SourceId } from './sources/sources.js';
export type { FollowedView, Ticket, ViewInput } from './tickets/service.js';
export type { TicketDefaults, TicketView } from './tickets/views.js';
export { UPDATE_CHANNELS, type UpdateChannel } from './update/feeds.js';
export type { Revoked, UpdateCheck, UpdateInstall } from './update/service.js';
export { costAlertText } from './usage/alert.js';
export type {
  UsageBreakdown,
  UsageRecord,
  UsageReport,
  UsageTotals,
} from './usage/records.js';
export type { WeeklyRewind } from './usage/rewind.js';
export type { BasesWritten } from './vault/bases.js';
export type { CanvasData, CanvasEdge, CanvasNode } from './vault/canvas.js';
export type { VaultHealth, VaultHealthFinding, VaultHealthKind } from './vault/health.js';
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
export type { McpTool, Stdio } from './vault/mount/mcp-server.js';
export type { ProjectContext } from './vault/mount/project-context.js';
export { DEFAULT_GOALS, type SessionGoal } from './vault/mount/session-goals.js';
export type {
  DecisionInput,
  NoteInput,
  Saved,
  SummaryInput,
} from './vault/mount/session-writes.js';
export {
  macObsidianPaths,
  type ObsidianPaths,
  type Opened,
  type VaultChoices,
} from './vault/obsidian.js';
export type { VaultPreview, VaultRead } from './vault/reader.js';
export { RECEIPT_TYPES } from './vault/receipt-file.js';
export {
  DEFAULT_VAULT_SEARCH_LIMIT,
  type VaultHit,
  type VaultMatch,
  type VaultSearch,
  type VaultSearchFilter,
} from './vault/search.js';
export type { VaultStatus } from './vault/vault.js';
export type { WorktreeDetails } from './worktrees/details.js';
export type { WorktreeAction } from './worktrees/facts.js';
export type { WorktreeFilter, WorktreeRow } from './worktrees/inventory.js';
export { branchLabel } from './worktrees/name.js';
export type { WorktreePreview } from './worktrees/preview.js';
