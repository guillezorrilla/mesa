---
project: kelp-ledger
type: decision
---
# Remote calls

Calls to couriers retry only on HTTP 503, at most 3 retries (4 attempts in all); any other failure, 4xx included, fails at once with the status in the error message.
