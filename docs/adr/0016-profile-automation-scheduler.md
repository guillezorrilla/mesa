# ADR-0016: Optional automation runs use a profile-owned GUI LaunchAgent

Status: accepted
Date: 2026-10-02

## Context

#39 needs local schedule, file and Faro-state rules, explicit installation, project serialization, approval and source refresh while the desktop app is closed. Source tokens already belong to the user's Keychain (ADR-0014). Session and import behavior already has core owners (ADR-0008). A system daemon would use a different account and Keychain context.

## Decision

`automations install` creates `~/Library/LaunchAgents/com.mesa.automations.<profile>.plist` and bootstraps it in `gui/<uid>`. The plist runs `automations tick` every 30 seconds and at load. Rule edits, reads, app startup and an uninstalled tick never install anything. The existing injected `MesaDeps.self` is the only CLI resolver: both its executable and CLI arguments are retained. WorkingDirectory is the initialized profile root. HOME, PATH, a UTF-8 locale and the optional broker URL are explicit; API keys and source tokens are not copied into the plist. The logged-in user's CLI reads the same macOS Keychain as an interactive invocation.

Cron has five numeric fields in local time, Sunday 0 or 7, and the usual OR between restricted day-of-month and weekday. Each tick looks at actual elapsed minutes, including repeated or missing minutes at daylight-saving changes. Missed occurrences coalesce to the latest matching minute per rule. Backward clock movement does not move the saved observation time backward. File rules compare file bytes, establish a baseline first, and reject traversal, Git internals and symlinks. Polling cannot see a write reverted between ticks. State rules establish a baseline, then use the Session Board's Faro-classified transitions. Their original confidence and decision probabilities stay with the queued trigger.

`automation-state.yaml` is private profile data. Observations, frozen rule definitions, pending approvals and results persist together through atomic writes under a short state lock. A saved worker claim serializes the entire profile, which is stricter than whole-project serialization. A later tick can observe and queue another event while a worker runs. Pending Ask rules need `automations approve`; Allow rules still run the normal project guardrail. Approval passes an ask, never a block. Disabled, removed or changed definitions cannot dispatch their saved work.

The dispatcher calls the existing skill, send, open and import services. Created sessions carry the rule and run id before the provider starts. An automation audit references the normal action receipt; a refresh still has exactly one refresh receipt with checked/skipped/refreshed ids. Ordinary automation audits stay out of meaningful history. Source content and notes keep the existing refresh policy, including failed-notes recovery and keep blocks.

Install and uninstall hold a durable lifecycle claim across asynchronous launchctl calls; a competing call reports locked instead of completing early. After a worker exits unexpectedly, the next tick stops any remaining sessions created by its running actions before marking those actions failed without replaying them, then dispatches saved queued work. A failed stop leaves cleanup pending for the next tick. Send and open are not automatically replayed. A crash can happen after an external action succeeds, so the failure explicitly leaves the outcome uncertain. Approvals and queued events survive a restart.

Uninstall first disables dispatch and cancels waiting work, then unloads only this profile's job and removes its owned plist. It stops only sessions whose persisted automation run id belongs to the profile's ledger and waits for its dispatcher to exit. If stopping fails or a manually invoked tick remains active, uninstall reports the failure and retains a stopping marker for retry. Other sessions, profiles and LaunchAgents are untouched. An existing unowned plist is refused.

## Evidence

`automations/scheduler.test.ts` exercises the public core API with a controlled clock, filesystem, source reads, launchctl runner and normal session owners. CLI and desktop checks exercise installation controls and durable approvals through their real command definitions. Real LaunchAgent and app qualification are recorded separately in `docs/spikes/automation-scheduler-qualification.md`.

## Consequences

No cloud scheduler, filesystem watcher library or additional cron dependency is needed. One profile worker limits throughput, and file/state events shorter than the polling interval can be missed. Full run history remains in the profile ledger; partition it if its size makes reads expensive. Refresh audits remain separate from meaningful project knowledge.
