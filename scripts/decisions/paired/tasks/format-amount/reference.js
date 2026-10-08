// Amounts are kept in whole cents.

/** The display string for `cents`. */
export function formatAmount(cents) {
  const units = (Math.abs(cents) / 100).toFixed(2);
  return cents < 0 ? `KLP (${units})` : `KLP ${units}`;
}
