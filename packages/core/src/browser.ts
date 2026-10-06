// What the app may bundle from core besides its types (`@mesa/core/browser`): pure modules with
// type imports only, so no Node code reaches the webview. The CLI reads the same from @mesa/core.
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
export { parseFileTarget } from './files/file-target.js';
export * from './lib/format.js';
export { localDay, validLocalDay } from './lib/time.js';
export { mapSession } from './map/map.js';
export {
  COLOR_VISION_MODES,
  DEFAULT_APPEARANCE,
  DEFAULT_TERMINAL_PREFERENCES,
  INTERFACE_DENSITIES,
  INTERFACE_FONTS,
  INTERFACE_THEMES,
  TERMINAL_APPS,
  TERMINAL_THEMES,
} from './profile/preferences.js';
export { DEFAULT_SHORTCUTS, shortcutFromKeys, validShortcut } from './profile/shortcuts.js';
export { repositoryUrl } from './projects/project-url.js';
export { PROJECT_SORTS, type ProjectSort } from './projects/sort.js';
export { type SearchHit, searchWorkspace } from './search/search.js';
export { descendantOrder } from './sessions/end/descendants.js';
export { GENERAL_PROJECT, projectLabel } from './sessions/record/general.js';
export * from './sessions/record/labels.js';
export { sessionProjects } from './sessions/record/session-projects.js';
export { FINAL_STATES, WAITING_STATES } from './sessions/record/states.js';
export { parseSessionUri, sessionUri } from './sessions/record/uri.js';
export { WORKFLOW_STATUSES, type WorkflowStatus } from './sessions/record/workflow-status.js';
export { DESCENDANTS_CAP } from './sources/browse.js';
export { NOTES_MAX_ITEMS } from './sources/notes-limit.js';
export { UPDATE_CHANNELS, UPDATE_LINK } from './update/feeds.js';
export { matchesVaultFilter, VAULT_CATEGORIES, VAULT_KINDS } from './vault/item.js';
export { MAP_PATH } from './vault/layout.js';
export { RECEIPT_TYPES } from './vault/receipt-file.js';
