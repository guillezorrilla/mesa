// What the app may bundle from core besides its types (`@mesa/core/browser`): pure modules with
// type imports only, so no Node code reaches the webview. The CLI reads the same from @mesa/core.
export {
  AGENT_CAPABILITIES,
  AGENT_EXECUTABLES,
  AGENT_LABELS,
  AGENT_NAMES,
  type Agent,
  type AgentCapability,
  agentCapabilityReport,
  DEFAULT_AGENT,
  supportsAgentCapability,
  supportsPlanStart,
} from './agents/names.js';
export * from './display.js';
export { parseFileTarget } from './files/file-target.js';
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
export { RECEIPT_TYPES } from './receipts/receipt-file.js';
export { type SearchHit, searchWorkspace } from './search/search.js';
export { descendantOrder } from './sessions/descendants.js';
export { GENERAL_PROJECT, projectLabel } from './sessions/general.js';
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
export { FINAL_STATES, WAITING_STATES } from './sessions/states.js';
export { parseSessionUri, sessionUri } from './sessions/uri.js';
export { WORKFLOW_STATUSES, type WorkflowStatus } from './sessions/workflow-status.js';
export { matchesVaultFilter, VAULT_CATEGORIES, VAULT_KINDS } from './vault/item.js';
export { MAP_PATH } from './vault/layout.js';
