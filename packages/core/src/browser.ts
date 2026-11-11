// What the app may bundle from core besides its types (`@mesa/core/browser`): pure modules with
// type imports only, so no Node code reaches the webview. The CLI reads the same from @mesa/core.

export { CODEX_REVIEW_TITLE, HOOKS_UPDATE_DETAIL } from './agents/hooks-update.js';
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
  supportsAgentCapability,
  supportsPlanStart,
} from './agents/names.js';
export { AGENT_STATES } from './agents/states.js';
export { describeAutomation } from './automations/describe.js';
export { type CheckResult, checkText } from './checks/check-text.js';
export { measuredText, type SiteMeasure, siteMeasure } from './decisions/measured.js';
export { type SiteMode, siteMode } from './decisions/site-mode.js';
export { DECISION_SITES, type DecisionSite } from './decisions/sites.js';
export { SYSTEM_ONE_PROVIDERS, type SystemOneProvider } from './decisions/systemone.js';
export { FEEDBACK_MAX } from './feedback/send.js';
export { parseFileTarget } from './files/file-target.js';
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
export { mapSession } from './map/map.js';
export { FINISHED_HOLD_MS } from './notifications/finished-hold.js';
export {
  type Delivery,
  type Fetch,
  type PairingClient,
  PairingError,
  type PairingInfo,
  pairingClient,
} from './phone/protocol/client.js';
export {
  type Opened,
  openDeliveries,
  openMessage,
  type PhoneMessage,
  phoneMessage,
  sealMessage,
} from './phone/protocol/envelope.js';
export { joinPairing, type PhonePairing, phoneKeys } from './phone/protocol/join.js';
export { formatPairingLink, type PairingLink, parsePairingLink } from './phone/protocol/link.js';
export {
  base64url,
  type Direction,
  fromBase64url,
  hashOf,
  newKeyPair,
  newSecret,
  open,
  type SideKeys,
  seal,
  sideKeys,
} from './phone/protocol/seal.js';
export {
  COLOR_VISION_MODES,
  DEFAULT_APPEARANCE,
  DEFAULT_TERMINAL_PREFERENCES,
  INTERFACE_DENSITIES,
  INTERFACE_FONTS,
  INTERFACE_THEMES,
  TERMINAL_APPS,
} from './profile/preferences.js';
export { profileSlug, profileVault, validProfileName } from './profile/profile-name.js';
export {
  DEFAULT_SHORTCUTS,
  FIXED_SHORTCUTS,
  shortcutFromKeys,
  validShortcut,
} from './profile/shortcuts.js';
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
export { PR_CLIS } from './prs/provider.js';
export { PROMPT_ONLY, promptGuarded } from './prs/review-guard.js';
export { canPost, reviewing, reviewsOf } from './prs/review-sessions.js';
export { parseChangelog, RELEASE_GROUPS, type ReleaseNotes } from './release/notes.js';
export { type CommandId, type SearchHit, searchWorkspace } from './search/search.js';
export {
  KEEP_AWAKE_LABELS,
  KEEP_AWAKE_MODES,
  type KeepAwakeMode,
  wantsAwake,
} from './sessions/awake.js';
export { descendantOrder } from './sessions/end/descendants.js';
export { inNextSend } from './sessions/input/next-send.js';
export { notesPrompt } from './sessions/input/notes-prompt.js';
export {
  NEW_SESSION,
  type NotesRecipient,
  notesRecipients,
} from './sessions/input/notes-recipients.js';
export { sessionFolder } from './sessions/record/folder.js';
export { GENERAL_PROJECT, projectLabel } from './sessions/record/general.js';
export * from './sessions/record/labels.js';
export * from './sessions/record/lifecycle.js';
export { sessionProjects } from './sessions/record/session-projects.js';
export { FINAL_STATES, WAITING_STATES } from './sessions/record/states.js';
export { parseSessionUri, sessionUri } from './sessions/record/uri.js';
export { WORKFLOW_STATUSES, type WorkflowStatus } from './sessions/record/workflow-status.js';
export { GUIDELINES } from './skills/guidelines.js';
export { DESCENDANTS_CAP } from './sources/browse.js';
export { describeSource, siteNames } from './sources/describe.js';
export { NOTES_MAX_ITEMS } from './sources/notes-limit.js';
export { DEFAULTS, type TicketDefaults } from './tickets/defaults.js';
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
