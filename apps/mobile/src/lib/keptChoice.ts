/** The choice that shows everything: the first chip of a row of counted chips. */
export const ALL = '';

/** `kept` while the chips still offer it; else All, as when what was picked has since gone. */
export const keptChoice = (choices: readonly { value: string }[], kept: string | undefined) =>
  kept !== undefined && choices.some((choice) => choice.value === kept) ? kept : ALL;
