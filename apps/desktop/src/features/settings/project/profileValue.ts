/** A profile value as the row that would inherit it names it. */
export const profileValue = (
  value: string | boolean | readonly string[] | undefined,
  none: string,
) => {
  const words =
    typeof value === 'boolean'
      ? value
        ? 'on'
        : 'off'
      : typeof value === 'string'
        ? value
        : value?.join(', ');
  return `Profile: ${words || none}`;
};
