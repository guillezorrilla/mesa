// Shipment lists. A shipment is { id, priority, dueAt }: priority is 'standard', 'fragile' or
// 'cold', and dueAt an ISO date-time.

/** `shipments` in the order the dispatch screen lists them. */
export function sortShipments(shipments) {
  return shipments.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}
