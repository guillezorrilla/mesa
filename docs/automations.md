# Automations

Automations are optional, profile-local rules. With none defined, Mesa behaves as before. Rule management is available in the Automations screen and with `mesa automations list|add|remove|enable|disable --json`. Creating or enabling a rule never installs a scheduler or starts a run. Scheduler execution is delivered separately in #423.

Add one rule as YAML or JSON:

```sh
mesa --profile work automations add '{name: refresh-docs, project: lantern-cove, when: cron, cron: "*/2 * * * *", run: refresh, notes: false, agent: claude, guardrail: ask}' --json
mesa --profile work automations list --json
mesa --profile work automations disable refresh-docs --json
mesa --profile work automations enable refresh-docs --json
mesa --profile work automations remove refresh-docs --json
```

The private file is `~/.mesa/work/automations.yaml`, an array of rules. Rule names are unique ignoring case; the project must already be registered. In the app, Add automation asks for a trigger, action, and permission. Notes start off, the agent defaults to Claude Code, and permission starts at Ask. Removing asks for confirmation.

| Trigger | Required detail |
| --- | --- |
| `when: cron` | `cron: "*/2 * * * *"`: minute, hour, day of month, month, weekday |
| `when: file` | `file: docs/spec.md`: path within the project |
| `when: state` | `state: idle`: working, waiting-permission, waiting-question, idle, done or failed |

Cron supports numeric values, `*`, comma lists, inclusive ranges and positive steps. Weekday 0 or 7 means Sunday. It uses local time. Invalid ranges, missing detail, unknown fields and details for a different trigger or action are refused before writes.

| Action | Details |
| --- | --- |
| `run: skill` | Required `skill`; optional `args` array, each a literal argument |
| `run: send` | Required Mesa `session` ID and `prompt` |
| `run: open` | Required `goal` |
| `run: refresh` | Optional `notes: false` to avoid notes runs |

Skill, Open and Refresh can specify `agent: claude` or `agent: codex`. Every rule must explicitly choose `guardrail: ask` or `guardrail: allow`; Allow never implies overriding Mesa's blocking guardrails. An absent `enabled` means true.
