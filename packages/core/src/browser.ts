// What the app may bundle from core besides its types (`@mesa/core/browser`): pure modules with
// type imports only, so no Node code reaches the webview. The CLI reads the same from @mesa/core.

export {
  CONFIG_GROUPS,
  type ConfigGroup,
  type ConfigSetting,
  configSetting,
  readableName,
} from './agents/claude/config-settings.js';
export {
  type ContextCategory,
  type ContextReport,
  parseContextReport,
} from './agents/claude/context-report.js';
export {
  type PlanLimit,
  type PlanUsage,
  type PlanUsageLine,
  type PlanUsageWindow,
  parsePlanUsage,
} from './agents/claude/plan-usage.js';
export {
  parseUsageForm,
  type UsageField,
  type UsageForm,
} from './agents/claude/usage-form.js';
export { CODEX_REVIEW_TITLE, HOOKS_UPDATE_DETAIL } from './agents/hooks-update.js';
export { MESA_SESSION_COMMANDS } from './agents/mesa-commands.js';
export {
  AGENT_CAPABILITIES,
  AGENT_EXECUTABLES,
  AGENT_LABELS,
  AGENT_NAMES,
  type Agent,
  type AgentCapability,
  ANTIGRAVITY_MODES,
  agentCapabilityReport,
  CLAUDE_PERMISSION_MODES,
  CODEX_APPROVAL_POLICIES,
  CODEX_SANDBOXES,
  DEFAULT_AGENT,
  modelLabel,
  supportsAgentCapability,
  supportsPlanStart,
} from './agents/names.js';
export { AGENT_STATES } from './agents/states.js';
export { type RunStep, runSentence } from './agents/step-words.js';
export { describeAutomation } from './automations/describe.js';
export { type CheckResult, checkText } from './checks/check-text.js';
export { invocation } from './commands/invocation.js';
export { measuredText, type SiteMeasure, siteMeasure } from './decisions/measured.js';
export { type SiteMode, siteMode } from './decisions/site-mode.js';
export { DECISION_SITES, type DecisionSite } from './decisions/sites.js';
export { SYSTEM_ONE_PROVIDERS, type SystemOneProvider } from './decisions/systemone.js';
export { FEEDBACK_MAX } from './feedback/send.js';
export { parseFileTarget } from './files/file-target.js';
export { hunkRange } from './git/hunk-range.js';
export {
  answeredBy,
  EMPTY_IMPACT,
  foldedText,
  type ImpactReport,
  type Moment,
  type SessionImpact,
} from './impact/report.js';
export { relativeAgo, shortAgo, timeAgo } from './lib/ago.js';
export * from './lib/format.js';
export { localClock, localDay, validLocalDay } from './lib/time.js';
export { answerParts } from './logs/answer.js';
export {
  cloudCopyText,
  cloudGroupSummary,
  consoleUrl,
  entryConsoleUrl,
  groupQuery,
} from './logs/cloud-copy.js';
export {
  cloudLevel,
  serviceRefOf,
  severityLabel,
  severityRank,
  splitMessage,
  traceIdOf,
} from './logs/cloud-entry.js';
export { copyText, groupSummaryText } from './logs/copy.js';
export { deployName, deploysOf, revisionLabel, startedAfter } from './logs/deploy-marks.js';
export { ENV_WORDS, envNameOf, joinEnvs } from './logs/env-names.js';
export { groupKey } from './logs/error-merge.js';
export { type FieldStat, fieldStats } from './logs/facets.js';
export {
  quoted,
  type ServiceConfig,
  serviceClause,
  servicePaths,
} from './logs/filter-text.js';
export { entryGroup } from './logs/fix-goal.js';
export { LOGIN_COMMAND } from './logs/gcloud-actions.js';
export { ALL_ENVS } from './logs/gcp-config.js';
export { errorGroups, isMuted, muteKey } from './logs/groups.js';
export {
  groupStats,
  type Incident,
  type IncidentLink,
  incidentReasons,
  incidentsOf,
  linkReason,
} from './logs/incidents.js';
export { jsonObject } from './logs/json-message.js';
export { CONTEXT_LINES, logMessage } from './logs/message.js';
export { normalizedMessage } from './logs/normalize.js';
export { groupTerms, occurrenceRuns, plainTitle, type Run } from './logs/occurrences.js';
export { withOwn } from './logs/own-filters.js';
export { entryText, LEVEL_NAMES } from './logs/parse.js';
export { NO_ORGANIZATION, type ProjectRow, projectRows } from './logs/project-rows.js';
export { type QueryField, queryFields } from './logs/query-fields.js';
export { sinceTime } from './logs/since.js';
export { sourceId, sourceLabel, sourceStateText } from './logs/source-id.js';
export { ownFrame, stackSummary, stackView } from './logs/stack.js';
export { messageParts, namesRequest } from './logs/tokens.js';
export { mapSession } from './map/map.js';
export { FINISHED_HOLD_MS } from './notifications/finished-hold.js';
export { PHONE_PUSH_LABELS, PHONE_PUSH_MODES, type PhonePushMode } from './phone/away.js';
export { PHONE_BETA_URL } from './phone/beta.js';
export * from './phone/protocol/index.js';
export { linkQr } from './phone/qr.js';
export {
  COLOR_VISION_MODES,
  DEFAULT_APPEARANCE,
  DEFAULT_TERMINAL_PREFERENCES,
  INTERFACE_DENSITIES,
  INTERFACE_FONTS,
  INTERFACE_THEMES,
  SESSION_VIEWS,
  TERMINAL_APPS,
  WEB_LINK_TARGETS,
} from './profile/preferences.js';
export { profileSlug, profileVault, validProfileName } from './profile/profile-name.js';
export {
  DEFAULT_SHORTCUTS,
  FIXED_SHORTCUTS,
  shortcutFromKeys,
  validShortcut,
} from './profile/shortcuts.js';
export {
  DEFAULT_TAB_STYLE,
  denserTabStyle,
  SIDEBAR_TAB_STYLES,
  SIDEBAR_TABS,
  type SidebarTab,
  type SidebarTabId,
  type SidebarTabStyle,
  showsLabel,
  sidebarTabs,
  withTabOrder,
  withTabShown,
} from './profile/sidebar-tabs.js';
export {
  currentTerminalTheme,
  TERMINAL_COLOR_GROUPS,
  TERMINAL_COLOR_KEYS,
  TERMINAL_PALETTE_CHOICES,
  TERMINAL_PRESET_IDS,
  TERMINAL_PRESETS,
  type TerminalColorKey,
  type TerminalColors,
  type TerminalPaletteChoice,
  terminalPalette,
} from './profile/terminal-palettes.js';
export { repositoryUrl } from './projects/project-url.js';
export { moveSession, orderSessions, withSessionOrder } from './projects/session-order.js';
export { PROJECT_SORTS, type ProjectSort } from './projects/sort.js';
export {
  actionable,
  BUCKET_LABELS,
  bucketRank,
  commentPlace,
  prStatus,
  threadProgress,
} from './prs/buckets.js';
export { MERGE_LABELS, MERGE_METHODS, type MergeMethod } from './prs/merge-methods.js';
export { PR_CLIS } from './prs/provider.js';
export { PROMPT_ONLY, promptGuarded } from './prs/review-guard.js';
export { canPost, reviewing, reviewsOf } from './prs/review-sessions.js';
export { parseChangelog, RELEASE_GROUPS, type ReleaseNotes } from './release/notes.js';
export { type CommandId, type SearchHit, searchWorkspace } from './search/search.js';
export { promptTitle, typedAnswerHint } from './sessions/answer/title.js';
export {
  KEEP_AWAKE_LABELS,
  KEEP_AWAKE_MODES,
  type KeepAwakeMode,
  wantsAwake,
} from './sessions/awake.js';
export { listedSession } from './sessions/board/listed.js';
export { descendantOrder } from './sessions/end/descendants.js';
export {
  agentModes,
  type ControlChoice,
  controlChoices,
  effortLabel,
  modeChoice,
  modelChoiceLabel,
} from './sessions/host/control-choices.js';
export { followedSession } from './sessions/host/follow-actions.js';
export { inNextSend } from './sessions/input/next-send.js';
export { notesPrompt } from './sessions/input/notes-prompt.js';
export {
  NEW_SESSION,
  type NotesRecipient,
  notesRecipients,
} from './sessions/input/notes-recipients.js';
export { sumFileEdits } from './sessions/native/file-edits.js';
export { sessionFolder } from './sessions/record/folder.js';
export { GENERAL_PROJECT, projectLabel } from './sessions/record/general.js';
export * from './sessions/record/labels.js';
export * from './sessions/record/lifecycle.js';
export { sessionProjects } from './sessions/record/session-projects.js';
export { FINAL_STATES, WAITING_STATES } from './sessions/record/states.js';
export { parseSessionUri, sessionUri } from './sessions/record/uri.js';
export { WORKFLOW_STATUSES, type WorkflowStatus } from './sessions/record/workflow-status.js';
export { SEQUENCE } from './sessions/window/terminal-text.js';
export { GUIDELINES } from './skills/guidelines.js';
export { DESCENDANTS_CAP } from './sources/browse.js';
export { describeSource, siteNames } from './sources/describe.js';
export { NOTES_MAX_ITEMS } from './sources/notes-limit.js';
export { DEFAULTS, type TicketDefaults } from './tickets/defaults.js';
export { groupByStatus, type StatusGroup } from './tickets/status-groups.js';
export {
  TICKET_STARTS,
  type TicketStart,
  ticketBranch,
  ticketStartPreview,
} from './tickets/ticket-start.js';
export { UPDATE_CHANNELS, UPDATE_LINK } from './update/feeds.js';
export { costAlertText } from './usage/alert.js';
export { matchesVaultFilter, VAULT_CATEGORIES, VAULT_KINDS } from './vault/item.js';
export { MAP_PATH } from './vault/layout.js';
export { RECEIPT_TYPES } from './vault/receipt-file.js';
export { branchLabel, worktreeName } from './worktrees/name.js';
