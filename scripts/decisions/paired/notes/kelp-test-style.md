---
project: kelp-ledger
type: decision
---
# Test style

Tests use node:test with node:assert/strict, one test file per module under test/, named after the module. Tests never reach the network: pass a fake fetch.
