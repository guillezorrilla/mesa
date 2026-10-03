# Faro's speed and value today (#487)

Date: 2026-10-03. Measured on the owner's Mac (Apple M1 Pro, 32 GB, macOS 26.6.2), Claude Code 2.1.288, Mesa at `d45d921` (0.1.1) built from the worktree. Live runs used the real HOME with a throwaway profile (`faro-spike`, tmux socket `mesa-faro-spike`), a temporary vault and two invented git checkouts, all deleted afterwards. Only invented content reached the model. From the owner's real profiles only aggregate counts were read.

The question: does Faro, as it runs today, make Mesa or its sessions slower, and does it decide better than plain rules? "Faro as it runs today" means `decisions.backend: adapter` (the default) with `decisions.threshold: 0.7`: the rules answer, and `claude -p --model haiku` is asked when the rules are unsure.

## Call-site map

Paths are under `packages/core/src/` unless they start with `packages/` or `apps/`. Every live `decide` call goes through `decide` in `decisions/decide.ts:102`. The rules answer first; the backend the profile names (`decisions.backend`, default `adapter` in `profile/config.ts:50`) is asked only when the least sure answer is below `decisions.threshold` (default 0.7, `config.ts:52`; the test is `decide.ts:123`, `unsure` at `decide.ts:68`). The only shared non-rules backend wired today is the adapter (`decisions/faro.ts:29`): `claude -p --model haiku` (or `codex exec` when `decisions.adapter: codex`), awaited inline with a 20 s timeout (`adapter.ts:11`, `adapter.ts:165`). `strands` exists as a client (`strands.ts`) but no call site wires it.

### Site 1: session state on the Board (`classifySession`)

| Caller | File:line | Backends reachable | Blocks? |
| --- | --- | --- | --- |
| Managed rows of every Board look | `sessions/board/managed.ts:156` via `listSessions` (`sessions/board/board.ts:97`, all rows in one `Promise.all`) | rules, then adapter when unsure (`sessions/state.ts:185`) unless the agent is Antigravity, or Codex with a screen marker (`state.ts:180`), or the adapter already answered for the same `basis` hash (`state.ts:184`) | Yes: the look awaits every row, so one unsure row holds the whole command for the adapter's full latency (up to 20 s per call; calls for several rows run in parallel) |
| Foreign rows (sessions Mesa did not start) | `sessions/board/foreign.ts:35` | rules only (`backends: []`) | No |
| Which looks pass the adapter | `sessions/service.ts:138` and `:149` (`backends: adapter ? faro.shared : []`, `adapter` defaults to true) | | |

Commands and app paths that run a look, and whether the adapter can hold them:

| Path | File:line | Adapter on? | Effect when a row is unsure |
| --- | --- | --- | --- |
| App Board quick look, every 2 s | `apps/desktop/src/features/sessions/useSessions.ts:14-17,31-34`, command `sessions --tree --no-adapter` (`apps/desktop/src/lib/client/sessions.ts:40`) | No | Never waits; shows the adapter's last saved answer while the rules stay unsure (`state.ts:189`) |
| App adapter look, every 2 s, one at a time | `useSessions.ts:22-26,33`, command `sessions --tree` (`client/sessions.ts:41`) | Yes | A second `mesa` process every 2 s; it waits for the adapter and saves the answer for the next quick look |
| `mesa sessions [--json]` (CLI default) | `packages/cli/src/commands/sessions.ts:33` | Yes, unless `--no-adapter` | The command waits for the adapter |
| Agents inside sessions: the shipped `mesa` skill runs `mesa sessions --json`, `mesa sessions --tree` and `mesa show` (`skills/mesa/SKILL.md:36,58,59`), and `mesa-handoff` runs `mesa show` (`skills/mesa-handoff/SKILL.md:15`) | | Yes | The agent's tool call waits, so the session itself is slower |
| `mesa board`, `mesa search`, `mesa show` | `packages/cli/src/commands/board.ts:11`, `search.ts:13`, `sessions/service.ts:633` | Yes | The command waits |
| `mesa pr-events --deliver` (app, every 60 s) | `mesa.ts:80`, `git/pr-event-delivery.ts:167,254`, `apps/desktop/src/app/hooks/usePrEventDelivery.ts:6` | Yes | Delivery waits |
| `mesa automations tick` (launchd scheduler, only with a `when: state` rule) | `automations/service.ts:35` | Yes | The tick waits |
| App: open a Mesa link to a session | `apps/desktop/src/app/hooks/useMesaLinks.ts:55` (`sessions.show`) | Yes | Waits |

Board decisions are never recorded: `look` passes no `recorder` (`sessions/service.ts:138-158`), so the adapter's latency, cost and fallbacks at this site are kept nowhere. Only the resulting state survives, as `lastState.source: adapter` plus a `basis` hash on the session record.

### Site 2: the guardrail (`checkGuardrail`)

| Caller | File:line | Backends reachable | Blocks? |
| --- | --- | --- | --- |
| `mesa send` (also the app's send, `image send` and browser annotate-send, which go through it) | `sessions/service.ts:291` -> `decisions/faro.ts:125` -> `decisions/guardrail.ts:127-128` | rules and the adapter are both passed, but every rules answer is 0.95 sure (`guardrail.ts:76-89`), so `unsure` is false at any threshold up to 0.95 and the adapter is never asked | Would block the send, but cannot fire at the default threshold |
| `mesa run <skill>` (headless skill runs) | `sessions/service.ts:580` | same | same |
| `mesa git push` / `pull` | `git/service.ts:44` | same | same |
| Automations before a run | `automations/actions.ts:35` | same | same |
| `mesa guardrail check` | `packages/cli/src/commands/guardrail.ts:17` -> `faro.ts:114` | same | same |

### Site 3: `mesa decide`

`packages/cli/src/commands/decide.ts:26` -> `faro.ts:104`: questions no rules know, so the rules answer evenly (always unsure) and the adapter is asked on every call when `backend: adapter`. Nothing in Mesa calls it; it is an explicit user or agent command, and the only Faro site that writes a decision receipt with `latencyMs` and `fallbackReason`.

### When are the rules unsure?

The state rules' confidences come from ADR-0003 (`sessions/state.ts:42-51`): a fresh hook 0.95, a stale hook 0.8, the Claude listing 0.85 (0.6 for a wait it cannot name, 0.5 for an unknown status, `agents/claude/listing.ts:63-72`), a process fact 0.85, the screen tail 0.6, and a just-launched session `idle` at 0.6 (`sessions/launch.ts:283-285`). With the 0.7 threshold, the adapter is asked only when no hook and no listing speak for a live session, so the tail (or the launch guess) decides:

- Claude with Mesa's hooks installed: practically never. A hook, even a stale one, is at least 0.8, and the listing names every live Claude session. Only the first look after launch, before `SessionStart` and the listing, can be unsure.
- Claude without hooks: only when the listing fails (2 s timeout, `listing.ts:24`) or does not yet list the session.
- Codex: its listing gives no state (`agents/agents.ts:208`), so without hooks the tail decides; the adapter is skipped when the tail shows a Codex marker (`state.ts:180-182`).
- Antigravity: never (`state.ts:180`).
- The guardrail: never at any threshold up to 0.95.

## Latency

Method: `bench.mjs` runs a command n times back to back and records wall time; `loop.mjs` replays the app's Board loop exactly (a `--no-adapter` look and an adapter look every 2 s, each one at a time). A shim named `claude` first on `PATH` logged every `claude` call Mesa made (listing, adapter, interactive) and its duration, then ran the real binary; interactive sessions got `--model haiku` to keep usage modest. Unsure sessions were made by starting sessions in a second invented checkout where the shim shows a fixed Claude screen instead of Claude (no process, so no hook and no listing; only the tail speaks): a permission menu, an idle prompt and a question menu taken from the repo's fixtures, and a spinner whose seconds counter ticks every second, as a real working Claude screen does. Two real Claude sessions with Mesa's hooks (already installed in the owner's `~/.claude/settings.json`, not changed) ran short invented tasks. Seven foreign Claude sessions of the owner were on the machine throughout; they appear in every look as rules-only rows.

### `mesa sessions --json` (the Board's read, adapter on by default in the CLI)

| Board | `backend: rules` p50 / p95 ms | `backend: adapter` p50 / p95 ms | Adapter calls |
| --- | --- | --- | --- |
| Empty (n=15 each) | 549 / 750 | 542 / 586 | 0 |
| 2 real hook-backed Claude sessions (2 runs of n=15 each) | 602 / 886, 569 / 664 | 569 / 873, 568 / 653 | 0 in 60 looks |
| + 3 static unsure sessions, first look | 575 / 639 | 13,256 (n=1) | 3, in parallel: 10.4, 11.8, 12.6 s |
| + 3 static unsure sessions, later looks (basis cached) | | 602 / 652 | 0 |
| + 1 ticking unsure session (n=15 rules, n=10 adapter) | 585 / 728 | 13,169 / 19,224 (max 19.2 s) | 10 in 10 looks, 10.9 to 18.3 s each |

While every session is hook-backed, the two backends are the same within noise. As soon as one row is unsure and its screen changed since the adapter last answered, the whole command waits for the adapter: 10 to 19 s instead of about 0.6 s, a 20x slowdown. A working screen changes every second (the spinner's counter), so the `basis` cache never holds and every adapter-on look pays it again.

### The app's Board loop (6 managed sessions: 2 hook-backed, 3 static unsure, 1 ticking unsure)

| | Quick look p50 / p95 / max ms | Adapter look p50 / p95 / max ms | Looks done |
| --- | --- | --- | --- |
| `rules`, 300 s | 673 / 894 / 997 | 670 / 877 / 988 | 150 quick, 149 adapter |
| `adapter`, 600 s | 654 / 1,175 / 2,267 | 17,785 / 20,776 / 20,987 | 296 quick (4 skipped), 32 adapter (267 ticks skipped while one ran) |

- The quick look the Board shows never waits for the adapter, as designed, but it got slower at the tail: p95 +281 ms (894 to 1,175), max 2.3 s, from the adapter look and its `claude -p` running beside it. The `claude agents --json --all` listing inside each look went from p95 306 ms (max 393) to p95 435 ms (max 1,737), close to its 2 s timeout, after which a look treats the listing as silent.
- An unsure state on the Board lags by the adapter look: 18 s at p50, 21 s at p95.
- Adapter calls: 24 in 600 s, all for the ticking session; p50 15.7 s, p95 19.2 s, max 19.4 s, against the 20 s timeout.

### Adapter calls per hour of a session's life

| Session | Adapter calls per hour |
| --- | --- |
| Claude with hooks (the default setup) | 0 (0 calls over 2 sessions and about 35 minutes of looks) |
| Unsure and static (a menu or prompt left waiting) | 1 per screen change (3 calls for 3 sessions over about 30 minutes) |
| Unsure and working (screen changes every second) | 144 (24 per 10 minutes with the app open) |

At the adapter's reported list price (0.0168 USD per call on average, `total_cost_usd`; the subscription charges nothing extra but the calls count against its usage), one working unsure session costs about 2.4 USD of list price per hour while the app is open.

### `mesa send`

| | `backend: rules` p50 / p95 ms | `backend: adapter` p50 / p95 ms |
| --- | --- | --- |
| `send --force` to an idle pane, guardrail evaluated (2 runs of n=10 each) | 365 / 388, 366 / 407 | 368 / 407, 376 / 505 |
| Same, after `mesa vault init` (2 runs of n=10 each) | 435 / 669, 402 / 648 | 382 / 1,258, 373 / 452 |

Zero `claude` calls were made by any of the 80 sends. `mesa guardrail check` under `backend: adapter` answered from `rules` at 0.95 in 2 ms. Differences are noise (one 1.26 s outlier). The send path is unaffected by Faro's adapter today.

## Accuracy on labelled session-state cases

Method: `accuracy.mjs` calls core's own `classifySession` (dist build) twice per case: rules only, and with the real `adapterBackend` (`claude -p --model haiku`, 20 s timeout), four cases at a time as a Board with a few unsure rows would. Cases where the rules are sure never reach the adapter and are counted as the rules' answer. Three sets:

- Repo fixtures: the 23 cases in `packages/core/src/sessions/fixtures/state/`, expected states from the state-signals spike.
- Live captures: 40 pane tails of the two real Claude sessions captured during the run (30 lines, as the Board captures), classified as if hooks and listing were silent. Ground truth is the state of the latest Mesa hook event at capture time (18 idle, 13 waiting-permission, 8 working, 1 waiting-question).
- Invented corpus: the 45 `supervision` cases in `packages/core/src/decisions/corpus/` (19 Claude, 17 Codex, 9 Antigravity screens), with the person's label. They start from the launch guess (`idle`, 0.6), so an unreadable screen keeps `idle`. 14 of them are `done` or `failed` screens, which the live Board never reads from the tail: a dead or gone window is a process fact and its tail is not passed (`sessions/board/managed.ts:151`).

| Set | Cases | Rules unsure | Adapter asked | Timed out (rules stand) | Rules correct | Rules + adapter correct | Answer changed | Change right | Right to wrong |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Repo fixtures | 23 | 7 | 7 | 1 | 23 | 22 | 1 | 0 | 1 |
| Live captures | 40 | 40 | 40 | 10 | 40 | 31 | 9 | 0 | 9 |
| Corpus, Board-reachable states | 31 | 31 | 18 | 6 | 22 | 23 | 7 | 4 | 3 |
| Corpus, `done` / `failed` screens | 14 | 14 | 11 | 1 | 0 | 8 | 9 | 8 | 0 |
| **All but the 14 `done` / `failed` screens** | **94** | **78** | **65** | **17** | **85** | **76** | **17** | **4** | **13** |

On the cases where the adapter was asked and the state is one the Board can reach from a screen: rules 61 of 65 right, rules + adapter 52 of 65. The adapter changed the answer 17 times and was right 4 times (24%); 13 changes turned a right answer wrong. Typical wrong changes: a permission menu read as a question (3 live captures and 1 corpus case), a working screen read as idle (3), an idle prompt read as a permission wait or `done` (3), a working screen read as `done` and a Codex idle prompt read as a question (1 corpus case each), and the fixture with a question in the reply above an empty prompt read as `waiting-question` (the case the rules were fixed for in review). Its only clear gain is on `done` and `failed` screens (8 right changes), which the live Board takes from process facts instead. On the 16 corpus cases where the rules were unsure but the adapter is not allowed (9 Antigravity, 7 Codex screens with a marker), nothing changes.

Adapter latency in this harness: p50 16.2 s, p95 20.8 s; 18 of 76 calls (24%) hit the 20 s timeout and fell back to the rules. Every timeout is a 20 s wait that changes nothing.

## Aggregates from the owner's real profiles (read-only, counts only)

| | Profile 1 | Profile 2 |
| --- | --- | --- |
| `decisions` | `adapter`, threshold 0.7 | `adapter`, threshold 0.7 |
| Session records | 2 (1 Claude, 1 Codex), both `done` | 0 |
| `lastState.source` | 1 `mesa`, 1 `tmux`, 0 `adapter` | none |
| Hook event logs | 1 file, 6 events | none |
| Receipts in the vault | 3 (1 vault decision, 2 actions), none with a Faro answer | 0 |

Share of session states from the adapter: 0 of 2. Adapter latency and fallback rate: not recorded anywhere. The Board site writes no Decision (`look` passes no recorder), and no guardrail or `mesa decide` receipt with a Faro answer exists. The real profiles hold too little history to say more; the rate has to come from the measurements above.

## How to rerun

The measurement scripts are not committed, because they drive live agents against a throwaway profile. The steps below reproduce them. To rerun from scratch:

1. Build: `pnpm install && pnpm build` in a worktree; `mesa` is `node packages/cli/dist/mesa.js`.
2. Throwaway profile: `export MESA_PROFILE=faro-spike`, unset `MESA_SESSION_ID` and `TMUX`, `mesa init --vault <tmp>/vault`, two invented checkouts with `git init` and a `mesa.yaml` holding `name: <slug>`, `mesa register <path>` each.
3. Measurement shim: a `claude` script first on `PATH` that logs `listing` (`agents` in argv), `adapter` (`--json-schema` in argv) and interactive calls with their duration, then execs the real `claude`; in the second checkout it shows a fixed screen instead (the fixture tails, or a spinner line whose seconds count up every second, then `cat > /dev/null`). Start those with `mesa open <fake> --goal FAKE:<screen>`. Accept Claude's trust prompt in the real checkout with `tmux -L mesa-faro-spike send-keys -t <window> Down Enter`.
4. Latency: `mesa config set decisions.backend rules|adapter`, then time `mesa sessions --json` n times in a row (15 here) and `mesa send --force <idle-session> "<text>"` (10 here); count the shim's `adapter` lines. The app loop: every 2 s spawn `mesa sessions --tree --no-adapter --json` and `mesa sessions --tree --json`, each skipped while its previous one still runs, for 300 s (rules) and 600 s (adapter).
5. Accuracy: import `classifySession` from `packages/core/dist/sessions/state.js`, `adapterBackend` from `dist/decisions/adapter.js` with `execRunner` and `redactPayload`; per case call it with `{profile: {decisions: {backend: 'rules', threshold: 0.7}}, backends: []}` and with `{backend: 'adapter'}` and `backends: [adapter]`. Live captures: `tmux capture-pane -p -S -30` of real sessions at moments chosen by you, labelled by the latest hook event in `~/.mesa/faro-spike/sessions/events/<id>.jsonl` at capture time through `AGENTS.claude.hookState`.
6. Real-profile aggregates: a read-only script over `~/.mesa/<profile>/config.yaml` (only `decisions`), `sessions/*.json` (agent, `lastState.source`, `state`), `sessions/events/*.jsonl` (event names) and the vault's `receipts/**/*.md` frontmatter (`type`, `decisions[].backend`, `outputs.latencyMs`, `outputs.fallbackReason`), printing counts only.
7. Clean up by explicit path: stop the sessions, `tmux -L mesa-faro-spike kill-server`, delete `~/.mesa/faro-spike`, the scratch vault and checkouts, and `~/.claude/projects/<escaped scratch checkout path>`.

Live model usage of this run: 2 interactive Claude sessions on Haiku with 4 short prompts, and about 115 adapter calls (`claude -p --model haiku`).

## Cleanup

Afterwards, the `mesa-faro-spike` tmux server was killed, and `~/.mesa/faro-spike`, its temp vault, both invented checkouts and the captured panes were deleted. `~/.claude/settings.json`, `~/.codex/hooks.json`, `~/.gemini/config/hooks.json` and the LaunchAgents listing had the same SHA-256 before and after. No command ran against the owner's profiles.

## Measured verdict

Slower: yes, whenever the adapter is actually asked, and for nothing in return. With Mesa's hooks installed every row is sure, the adapter is never called, and `mesa sessions --json` takes the same time under both backends (p50 about 570 ms). One unsure row makes every adapter-on Board read wait for `claude -p`: p50 13.2 s and p95 19.2 s instead of 0.6 s. That covers `mesa sessions`, `mesa board`, `mesa show`, `mesa search`, PR-event delivery and the automations tick, and the `mesa sessions --json` and `mesa show` calls that the shipped `mesa` skill teaches agents inside sessions. A working unsure session costs 144 adapter calls per hour with the app open. The app's quick look never waits, but beside the adapter look its p95 rose from 894 to 1,175 ms and the listing's max from 0.4 to 1.7 s; an unsure state shows up 18 to 21 s late. `mesa send` is not slower: the guardrail's rules are 0.95 sure, so the adapter is unreachable there (zero calls in 80 sends, p50 365 vs 368 ms).

More accurate: no. On the Board-reachable cases where it was asked, rules alone were right 61 of 65 times and rules + adapter 52 of 65. The adapter changed 17 answers and was right on 4 of them; on live Claude panes it was wrong on all 9 changes it made. Its only gains are on `done` and `failed` screens, which the Board takes from process facts, not from the screen. 24% of its calls timed out at 20 s under four concurrent calls. In the owner's real profiles it decided 0 of 2 recorded session states, and the Board site keeps no record of its latency, cost or fallbacks.

## Alternatives

The owner's direction, 2026-10-03:
- A decision model runs only when the user supplies its key. With no key, Mesa skips model decisions: rules only, no `claude -p` fallback.
- No model is ever downloaded or run locally. Decision models are API only.
- The person chooses among three: TypeSafe Jev, Cloudflare CLEF, or Strands Decider (#488).

All three answer Faro's own question types (Choice, Score, Noul), sending `state` plus typed `questions`. All three were announced in the last three weeks. None has been tested on a Mesa terminal pane through a hosted path.

| | Jev (TypeSafe) | CLEF (Cloudflare) | Strands Decider |
| --- | --- | --- | --- |
| Key | TypeSafe API key, Bearer, `POST https://api.typesafe.ai/v1/systemone` ([quickstart](https://docs.typesafe.ai/introduction/quickstart)) | Account ID plus a token with Workers AI Read and Edit, `POST .../accounts/{id}/ai/run/@cf/cloudflare/clef-flash` ([docs](https://developers.cloudflare.com/workers-ai/models/clef)) | Hugging Face token for a Space or Endpoint the user owns. No Inference Provider serves it ([card](https://huggingface.co/StrandsAgents/strands-decider-2B-hobson-v19)) |
| Price | $0.042 per M input tokens, output free, $5 starting credit; new signups paused since 2026-09-22, and Vercel AI Gateway also serves it ([eesel](https://www.eesel.ai/blog/typesafe-jev-pricing), [Layer3](https://www.layer3labs.io/guides/is-jev-free)) | clef-flash $0.09 per M, clef $0.24 per M; 10,000 free Neurons a day ([pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)) | Free ZeroGPU Space: 5 GPU minutes a day, for accounts over 30 days old. Endpoint from $0.50/h ([ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu)) |
| Vendor latency | 70 to 500 ms (TypeSafe's claim; the docs give no figure) | clef-flash p50 38.8 ms, p95 122.4 ms (H200, network excluded) | 115 ms median on an RTX 3090; hosted latency unmeasured |
| Data | No retention statement found in the docs | Cloudflare says it does not read, store or train on requests | The user's own Space |
| Licence | Hosted API | Apache-2.0 open weights | Apache-2.0 |

At the Board's 2 s poll, one busy unsure session could ask up to 1,800 times an hour. That is about $0.13 an hour on clef-flash, and it uses up CLEF's free tier or a free ZeroGPU quota in under an hour. The 144 calls an hour measured above are a more realistic rate. On the calibration split, not the held-out one, P11 found that Strands did not beat the rules on supervision (7 right and accepted, against the rules' 8).

**Guardrail:** none of the three fit. The rules already answer at 0.95. A hosted call would add latency to every send, and it would send the very prompt that may hold a secret to a third party, which is the risk the guardrail exists to stop.

## Recommendation

1. **Drop the `claude -p` adapter now.** It makes the Board, and the agents that read it, wait 13 to 19 s whenever it is asked. It costs up to 144 calls an hour. It turns right answers into wrong ones 13 times out of 17. Default `decisions.backend` to `rules`, read an existing `adapter` value as `rules` (no profile file needs editing), and remove `adapter.ts` with its Board wiring. This is the owner's "bypass the decisions and let the AI work normally" for a profile with no key.
2. **Keep Faro's rules and its seam.** The rules are what answer today: 61 of 65 on the reachable cases, every live pane right, and and the guardrail's verdicts, which never reach the adapter at the default threshold. The `Backend` seam stays, because #488 adds the hosted models behind it. It has real implementations coming, so it is not a pass-through.
3. **The guardrail stays rules only, for good.** No hosted model ever sees a prompt before it is sent.
4. **A hosted model (#488) may answer session state only under two conditions.** First, it runs beside the Board read and never inside it, the way the quick look already works, so no command or agent tool call ever waits on it. Second, it first passes the ADR-0019 held-out supervision gate on Mesa's panes: selective accuracy of at least 0.90, coverage of at least 0.40, and more answers right and accepted than the rules. Until a model passes, the user's key turns nothing on for that site, and the Settings card says so.
5. **Fix the real cause of unsure rows.** They come from sessions with no hook and no listing. With hooks installed, the measured runs made 0 adapter calls, so making sure Mesa's hooks are installed, for example from the Set up screen, removes most unsure rows without any model.
6. **Record what a model costs.** If a model returns at the Board site, each answer records its latency, cost and fallback. Today that site records nothing.
