// What the app may bundle from core besides its types (`@mesa/core/browser`): pure modules with
// type imports only, so no Node code reaches the webview. The CLI reads the same from @mesa/core.
export { AGENT_LABELS, AGENT_NAMES, type Agent, DEFAULT_AGENT } from './agents/names.js';
export * from './display.js';
export { RECEIPT_TYPES } from './receipts/receipt-file.js';
export { FINAL_STATES, WAITING_STATES } from './sessions/states.js';
