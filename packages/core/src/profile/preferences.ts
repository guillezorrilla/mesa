/** Profile appearance choices shared by validation and the desktop controls. */
export const INTERFACE_THEMES = ['system', 'dark', 'light'] as const;
export const INTERFACE_FONTS = ['plex', 'system'] as const;
export const INTERFACE_DENSITIES = ['comfortable', 'compact'] as const;
export const COLOR_VISION_MODES = ['normal', 'red-green', 'blue-yellow'] as const;
export const TERMINAL_THEMES = ['follow', 'dark', 'light'] as const;
/** The sidebar's project orders (projects/sort.ts), `name` first as the default. */
export const PROJECT_SORTS = [
  'name',
  'recent',
  'last-session',
  'active-sessions',
  'most-visited',
] as const;
export const TERMINAL_APPS = ['Terminal', 'iTerm', 'Ghostty', 'WezTerm'] as const;

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
} as const;
