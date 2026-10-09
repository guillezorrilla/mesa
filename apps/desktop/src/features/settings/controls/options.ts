import { TERMINAL_PRESETS } from '@mesa/core/browser';

/** Words for core's choices; the choices themselves are core's, so validation and controls agree. */
const LABEL: Record<string, string> = {
  system: 'System',
  dark: 'Dark',
  light: 'Light',
  follow: 'Follow interface theme',
  plex: 'IBM Plex Sans',
  comfortable: 'Comfortable',
  compact: 'Compact',
  normal: 'Normal',
  'red-green': 'Red-green',
  'blue-yellow': 'Blue-yellow',
  custom: 'Custom',
  ...Object.fromEntries(Object.entries(TERMINAL_PRESETS).map(([id, { label }]) => [id, label])),
};
/** The word for one of core's choices. */
export const label = (value: string) => LABEL[value] ?? value;
export const options = <T extends string>(values: readonly T[]) =>
  values.map((value) => [value, label(value)] as const);
