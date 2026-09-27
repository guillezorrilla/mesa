---
created: 2026-09-24T12:00
updated: 2026-09-24T12:00
source: mesa
type: skill
id: 01TEST00000000000000000001
profile: default
project: lantern-cove
session: a1b2c3d4
agent: claude
started: 2026-09-24T12:00
ended: 2026-09-24T12:01
status: failed
command: mesa run tidy-readme --project lantern-cove
decisions: []
inputs:
  skill: tidy-readme
  args: []
outputs:
  agentSessionId: 00000000-0000-4000-8000-000000000001
  durationMs: 60000
  output: ~/.mesa/default/sessions/runs/a1b2c3d4.json
  reason: claude exited with status 1
  events:
    exited: 1
  lastState:
    state: failed
    confidence: 1
    at: 2026-09-24T12:01:00.000Z
    source: mesa
cost: 0.042
---
Skill tidy-readme failed on lantern-cove

## Details

None.
