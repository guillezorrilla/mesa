---
created: 2026-09-24T12:00
updated: 2026-09-24T12:00
source: mesa
type: decision
id: 01TEST00000000000000000001
profile: default
project: lantern-cove
session: a1b2c3
started: 2026-09-24T12:00
status: blocked
command: mesa send a1b2c3 "git push --force"
decisions:
  - question: Allow sending this prompt?
    kind: Choice
    answer: block
    probabilities:
      allow: 0.08
      ask: 0.22
      block: 0.7
    confidence: 0.81
    backend: rules
  - question: Is the prompt destructive?
    kind: Noul
    answer: true
    probabilities: 0.93
    backend: rules
inputs:
  prompt: git push --force
outputs: {}
---
Guardrail blocked a prompt to session a1b2c3

## Details

None.
