---
project: kelp-ledger
type: decision
---
# Shipment order

Dispatch lists cold shipments first, then fragile, then standard; within a priority, the earliest dueAt first. Sorting returns a new array and never reorders the caller's.
