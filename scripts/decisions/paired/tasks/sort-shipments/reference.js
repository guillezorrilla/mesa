// Shipment lists. A shipment is { id, priority, dueAt }: priority is 'standard', 'fragile' or
// 'cold', and dueAt an ISO date-time.

const RANK = { cold: 0, fragile: 1, standard: 2 };

/** `shipments` in the order the dispatch screen lists them. */
export function sortShipments(shipments) {
  return [...shipments].sort(
    (a, b) => RANK[a.priority] - RANK[b.priority] || Date.parse(a.dueAt) - Date.parse(b.dueAt),
  );
}
