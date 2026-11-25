/** Profile appearance choices shared by validation and the desktop controls. */
export const INTERFACE_THEMES = ['system', 'dark', 'light'] as const;
export const INTERFACE_FONTS = ['plex', 'system'] as const;
export const INTERFACE_DENSITIES = ['comfortable', 'compact'] as const;
export const COLOR_VISION_MODES = ['normal', 'red-green', 'blue-yellow'] as const;
/** The sidebar's project orders (projects/sort.ts), `name` first as the default. */
export const PROJECT_SORTS = [
  'name',
  'recent',
  'last-session',
  'active-sessions',
  'most-visited',
] as const;
/**
 * How a session shows in the app: its terminal, a chat over that terminal's transcript, or
 * Structured (ADR-0029), where a new Claude Code or Codex session runs under `mesa host` and shows as Chat.
 */
export const SESSION_VIEWS = ['terminal', 'chat', 'structured'] as const;
export const TERMINAL_APPS = ['Terminal', 'iTerm', 'Ghostty', 'WezTerm'] as const;
/** Where a web link clicked in a session terminal opens: Mesa's Browser panel or the default browser. */
export const WEB_LINK_TARGETS = ['mesa', 'default'] as const;

export const DEFAULT_APPEARANCE = {
  theme: 'system',
  font: 'plex',
  fontSize: 16,
  diffFontSize: 13,
  fileTreeFontSize: 14,
  density: 'comfortable',
  colorVision: 'normal',
} as const;

export const DEFAULT_TERMINAL_PREFERENCES = {
  theme: 'follow',
  fontSize: 13,
  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
  optionAsMeta: false,
  naturalSelection: false,
  scrollSpeed: 3,
  extraSubmitKey: 'none',
  newlineKey: 'shift-enter',
  wezTermNewTab: false,
  messageActions: true,
  sessionView: 'terminal',
  webLinks: 'mesa',
} as const;
