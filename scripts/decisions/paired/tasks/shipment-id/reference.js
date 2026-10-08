// Identifiers.

/** The id of the `seq`th shipment booked on `date` (a Date). */
export function newShipmentId(date, seq) {
  const day = date.toISOString().slice(0, 10).replaceAll('-', '');
  return `SHP-${day}-${String(seq).padStart(5, '0')}`;
}
