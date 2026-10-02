# Automations

Automations are optional, profile-local rules. With none defined, Mesa behaves as before. Rule management is available in the Automations screen and with `mesa automations list|add|remove|enable|disable --json`. Creating or enabling a rule never installs a scheduler or starts a run. Install, uninstall, status and pending approvals are also available there.

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

## Change-aware refresh

`mesa import refresh --project <slug> --changed-only [--no-notes] --json` checks every selected item before writing. It compares [Confluence `version.number`](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/#api-pages-id-get), [Jira `fields.updated`](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-get), [Notion `last_edited_time`](https://developers.notion.com/reference/page), and the SHA-256 of a web page's HTML. Native unchanged items need only a metadata GET; public web pages need a GET to hash their content. Each snapshot keeps the revision of the content actually fetched. Legacy snapshots without one refresh once to seed it.

One receipt lists checked, skipped, and refreshed ids. Skipped items create no snapshot and run no agent. All source reads must succeed before the first snapshot write; an inaccessible item leaves earlier snapshots and notes intact. Changed notes run in batches of at most 50, preserving the existing locked-note and `<!-- keep -->` behavior. Change-aware notes use Claude by default, even if the project's default is Antigravity. The core caller may explicitly choose Codex. Write notes can be turned off.

The project's Context tab has **Refresh changed items** and shows the last check's counts. Ordinary per-item Refresh and CLI refresh without `--changed-only` keep their prior behavior. A failed notes run leaves its new snapshots and reports the failure. Changed notes are marked pending in the profile before snapshot writes. The next check still preflights every source, then retries failed or unattempted notes from the existing snapshots, without creating duplicate snapshots. `notesRetried` lists those ids. Locked notes stay pending until unlocked; Write notes off leaves pending work alone.


Install explicitly after adding rules:

```sh
mesa --profile work automations install --json
mesa --profile work automations status --json
mesa --profile work automations approve RUN_ID --json
mesa --profile work automations cancel RUN_ID --json
mesa --profile work automations uninstall --json
```

Installation creates only `~/Library/LaunchAgents/com.mesa.automations.work.plist` in the logged-in user's GUI domain. It calls the same absolute Mesa CLI, with an explicit PATH, UTF-8 locale and profile working directory, every 30 seconds. Source tokens stay in that user's Keychain. The app can be closed. `automations tick --json` runs one observation/dispatch pass when installed; otherwise it is inert.

Cron uses local time. Restricted day-of-month and weekday fields match either one. Missed schedule occurrences coalesce to the latest due minute; a restart does not replay every missed interval. Files and Faro state transitions establish a baseline on their first observation. Polling cannot detect a change reverted before the next tick. One profile worker runs queued actions serially. Ask creates a saved pending approval; approving it lets that occurrence pass an ask, but never bypasses a block. Allow still uses the project's normal guardrail.

The Automations screen shows pending approvals and recent runs. The project Context tab shows its refresh rules and their saved last results. Board sessions show the rule that created them. A removed, disabled or changed definition cannot launch its saved queued action. Pending approvals survive a restart. After an interrupted worker, in-progress actions are marked failed with an uncertain outcome and are not replayed automatically.

Uninstall cancels waiting work, unloads this profile's job, removes its plist and stops sessions created by its automation runs. Existing sessions that received a send remain yours. If an owned tick is still stopping, the command reports that and can be retried. It preserves other jobs and profiles. Runtime state and audit receipts remain as history until you remove the disposable profile and vault. Each automation audit links its normal action receipt; each refresh has one separate refresh audit with item counts. Routine audit entries do not populate meaningful project history.
