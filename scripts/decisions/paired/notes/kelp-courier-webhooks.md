---
project: kelp-ledger
type: decision
---
# Courier webhooks

Inbound courier webhooks are acknowledged with HTTP 202 within 2 seconds and processed later from the queue; a duplicate delivery is recognised by its delivery id.
