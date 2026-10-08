// Parcel weights.

/** The weight `text` names (such as "1.25kg"), as the ledger stores it. */
export function parseWeight(text) {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(kg|g)\s*$/.exec(text);
  if (!match) throw Object.assign(new Error(`unknown weight unit: ${text}`), { code: 'E_UNIT' });
  const grams = Number(match[1]) * (match[2] === 'kg' ? 1000 : 1);
  return Math.round(grams);
}
