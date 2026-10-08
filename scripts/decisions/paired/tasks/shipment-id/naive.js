// Identifiers.

/** The id of the `seq`th shipment booked on `date` (a Date). */
export function newShipmentId(date, seq) {
  return `SHP-${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}-${seq}`;
}
