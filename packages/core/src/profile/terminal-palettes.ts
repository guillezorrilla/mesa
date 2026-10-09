/**
 * The session terminals' color palettes: 12 presets, the user's own `custom` colors, and `follow`,
 * which takes Mesa Dark or Mesa Light with the interface theme. Only the terminals use them; the
 * interface keeps its own theme (`appearance.theme`).
 */

/** A palette's 20 colors, under xterm's names. */
export const TERMINAL_COLOR_KEYS = [
  'background',
  'foreground',
  'cursor',
  'selectionBackground',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const;
export type TerminalColorKey = (typeof TERMINAL_COLOR_KEYS)[number];
export type TerminalColors = Record<TerminalColorKey, string>;

/** A palette color as config takes it: `#rrggbb`. */
export const TERMINAL_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * A palette from three space-separated rows of colors: background, foreground, cursor and
 * selection; the 8 normal ANSI colors, black to white; the 8 bright ones.
 */
const palette = (base: string, normal: string, bright: string): TerminalColors =>
  Object.fromEntries(
    `${base} ${normal} ${bright}`.split(' ').map((color, i) => [TERMINAL_COLOR_KEYS[i], color]),
  ) as TerminalColors;

export const TERMINAL_PRESETS = {
  // Mesa's own: the terminal colors the app had before palettes, with zinc-toned ANSI colors.
  'mesa-dark': {
    label: 'Mesa Dark',
    colors: palette(
      '#09090b #f4f4f5 #f4f4f5 #3f3f46',
      '#27272a #ef4444 #22c55e #eab308 #3b82f6 #d946ef #06b6d4 #d4d4d8',
      '#52525b #f87171 #4ade80 #facc15 #60a5fa #e879f9 #22d3ee #fafafa',
    ),
  },
  'mesa-light': {
    label: 'Mesa Light',
    colors: palette(
      '#ffffff #18181b #18181b #d4d4d8',
      '#27272a #dc2626 #16a34a #ca8a04 #2563eb #c026d3 #0891b2 #a1a1aa',
      '#71717a #ef4444 #22c55e #eab308 #3b82f6 #d946ef #06b6d4 #d4d4d8',
    ),
  },
  // https://github.com/folke/tokyonight.nvim/blob/main/extras/alacritty/tokyonight_night.toml
  'tokyo-night': {
    label: 'Tokyo Night',
    colors: palette(
      '#1a1b26 #c0caf5 #c0caf5 #283457',
      '#15161e #f7768e #9ece6a #e0af68 #7aa2f7 #bb9af7 #7dcfff #a9b1d6',
      '#414868 #ff899d #9fe044 #faba4a #8db0ff #c7a9ff #a4daff #c0caf5',
    ),
  },
  // https://draculatheme.com/spec and https://github.com/dracula/iterm
  dracula: {
    label: 'Dracula',
    colors: palette(
      '#282a36 #f8f8f2 #f8f8f2 #44475a',
      '#21222c #ff5555 #50fa7b #f1fa8c #bd93f9 #ff79c6 #8be9fd #f8f8f2',
      '#6272a4 #ff6e6e #69ff94 #ffffa5 #d6acff #ff92df #a4ffff #ffffff',
    ),
  },
  // https://github.com/catppuccin/alacritty/blob/main/catppuccin-mocha.toml
  'catppuccin-mocha': {
    label: 'Catppuccin Mocha',
    colors: palette(
      '#1e1e2e #cdd6f4 #f5e0dc #585b70',
      '#45475a #f38ba8 #a6e3a1 #f9e2af #89b4fa #f5c2e7 #94e2d5 #bac2de',
      '#585b70 #f38ba8 #a6e3a1 #f9e2af #89b4fa #f5c2e7 #94e2d5 #a6adc8',
    ),
  },
  // https://github.com/catppuccin/alacritty/blob/main/catppuccin-latte.toml
  'catppuccin-latte': {
    label: 'Catppuccin Latte',
    colors: palette(
      '#eff1f5 #4c4f69 #dc8a78 #acb0be',
      '#5c5f77 #d20f39 #40a02b #df8e1d #1e66f5 #ea76cb #179299 #acb0be',
      '#6c6f85 #d20f39 #40a02b #df8e1d #1e66f5 #ea76cb #179299 #bcc0cc',
    ),
  },
  // https://github.com/nathanbuchar/atom-one-dark-terminal
  'one-dark': {
    label: 'One Dark',
    colors: palette(
      '#1e2127 #abb2bf #abb2bf #3e4451',
      '#000000 #e06c75 #98c379 #d19a66 #61afef #c678dd #56b6c2 #abb2bf',
      '#5c6370 #e06c75 #98c379 #d19a66 #61afef #c678dd #56b6c2 #ffffff',
    ),
  },
  // https://ethanschoonover.com/solarized/ (its terminal mapping)
  'solarized-dark': {
    label: 'Solarized Dark',
    colors: palette(
      '#002b36 #839496 #93a1a1 #073642',
      '#073642 #dc322f #859900 #b58900 #268bd2 #d33682 #2aa198 #eee8d5',
      '#002b36 #cb4b16 #586e75 #657b83 #839496 #6c71c4 #93a1a1 #fdf6e3',
    ),
  },
  // https://ethanschoonover.com/solarized/ (its terminal mapping)
  'solarized-light': {
    label: 'Solarized Light',
    colors: palette(
      '#fdf6e3 #657b83 #586e75 #eee8d5',
      '#073642 #dc322f #859900 #b58900 #268bd2 #d33682 #2aa198 #eee8d5',
      '#002b36 #cb4b16 #586e75 #657b83 #839496 #6c71c4 #93a1a1 #fdf6e3',
    ),
  },
  // https://github.com/morhetz/gruvbox
  'gruvbox-dark': {
    label: 'Gruvbox Dark',
    colors: palette(
      '#282828 #ebdbb2 #ebdbb2 #504945',
      '#282828 #cc241d #98971a #d79921 #458588 #b16286 #689d6a #a89984',
      '#928374 #fb4934 #b8bb26 #fabd2f #83a598 #d3869b #8ec07c #ebdbb2',
    ),
  },
  // https://github.com/morhetz/gruvbox
  'gruvbox-light': {
    label: 'Gruvbox Light',
    colors: palette(
      '#fbf1c7 #3c3836 #3c3836 #d5c4a1',
      '#fbf1c7 #cc241d #98971a #d79921 #458588 #b16286 #689d6a #7c6f64',
      '#928374 #9d0006 #79740e #b57614 #076678 #8f3f71 #427b58 #3c3836',
    ),
  },
  // https://github.com/mbadolato/iTerm2-Color-Schemes/blob/master/schemes/Monokai%20Classic.itermcolors
  monokai: {
    label: 'Monokai',
    colors: palette(
      '#272822 #fdfff1 #c0c1b5 #57584f',
      '#272822 #f92672 #a6e22e #e6db74 #fd971f #ae81ff #66d9ef #fdfff1',
      '#6e7066 #f92672 #a6e22e #e6db74 #fd971f #ae81ff #66d9ef #fdfff1',
    ),
  },
} as const satisfies Record<string, { label: string; colors: TerminalColors }>;
export type TerminalPreset = keyof typeof TERMINAL_PRESETS;
export const TERMINAL_PRESET_IDS = Object.keys(TERMINAL_PRESETS) as TerminalPreset[];

/** What a project's mesa.yaml may set: shared with the repository, so no `custom`. */
export const PROJECT_TERMINAL_THEMES = [
  'follow',
  ...(TERMINAL_PRESET_IDS as [TerminalPreset, ...TerminalPreset[]]),
  // Before palettes: kept so older configs and mesa.yaml files still load.
  'dark',
  'light',
] as const;
export const TERMINAL_THEMES = [...PROJECT_TERMINAL_THEMES, 'custom'] as const;
export type TerminalTheme = (typeof TERMINAL_THEMES)[number];

/** The themes from before palettes, and the preset each now names. */
export const TERMINAL_THEME_ALIASES: Partial<Record<TerminalTheme, TerminalPreset>> = {
  dark: 'mesa-dark',
  light: 'mesa-light',
};

/**
 * The 20 colors a terminal gets: `follow` is Mesa Dark or Mesa Light with the interface theme, a
 * preset (or its old alias) is fixed, and `custom` is the profile's own `colors`.
 */
export function terminalPalette(
  terminal: { theme: TerminalTheme; colors?: Partial<TerminalColors> },
  interfaceDark: boolean,
): TerminalColors {
  const followed = TERMINAL_PRESETS[interfaceDark ? 'mesa-dark' : 'mesa-light'].colors;
  const { theme } = terminal;
  if (theme === 'custom') return { ...followed, ...terminal.colors };
  if (theme === 'follow') return followed;
  return TERMINAL_PRESETS[TERMINAL_THEME_ALIASES[theme] ?? (theme as TerminalPreset)].colors;
}
