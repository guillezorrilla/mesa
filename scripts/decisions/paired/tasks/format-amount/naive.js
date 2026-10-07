// Amounts are kept in whole cents.

/** The display string for `cents`. */
export function formatAmount(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}
