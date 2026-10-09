---
project: lantern-cove
type: decision
---
# Feed retry policy

The tide table import retries the harbour feed 5 times on HTTP 503, with exponential backoff from 2 seconds. Other errors fail the import at once and show on the status page.
