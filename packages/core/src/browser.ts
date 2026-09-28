// What the app may bundle from core besides its types (`@mesa/core/browser`): pure modules with
// type imports only, so no Node code reaches the webview. The CLI reads the same from @mesa/core.
export { AGENT_LABELS, AGENT_NAMES, type Agent, DEFAULT_AGENT } from './agents/names.js';
export * from './display.js';
export { DEFAULT_SHORTCUTS, shortcutFromKeys, validShortcut } from './profile/shortcuts.js';
export { repositoryUrl } from './projects/project-url.js';
export { RECEIPT_TYPES } from './receipts/receipt-file.js';
export { type SearchHit, searchWorkspace } from './search/search.js';
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
export { WORKFLOW_STATUSES, type WorkflowStatus } from './sessions/workflow-status.js';
