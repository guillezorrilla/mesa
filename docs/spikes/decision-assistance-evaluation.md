# Decision assistance evaluation: paired workflows, concurrency and the packaged app (#465)

Status: harness, measurement script and failure-mode tests merged; **every table below is pending the live run**. Date of the live run: pending. Mac: pending. Claude Code: pending. Mesa: branch `decisions/workflow-gains`, commit pending. Decision models: `jev-1.13.0` and `clef` (27B), the ids #638 qualified (`SYSTEM_ONE_MODELS`); a changed id means a new calibration and held-out run first.

## What is being proven

ADR-0019's frozen gates, which are never lowered:

- **Quality** (held-out split, per site): already measured in `docs/spikes/jev-clef-qualification.md`. Both models passed every site (`PASSED_GATE`). Test plan 1 re-checks it below.
- **Paired workflows** (`PAIRED_GATE`, `decisions/evaluation/paired.ts`): at least 6 invented coding tasks, assistance off and on, the same main model and setup, randomised order, 2 repetitions per arm. Assistance passes only if its successes are at least as many as without, its time per successful task (the arm's total wall time over its successes; unbounded with none) is no more than 10% worse, and it solves at least one more task or is at least 10% faster per solved task. More decision calls or faster answers alone never count.
- **Concurrency and safety** (hosted): with 1, 4 and 8 concurrent sessions, every request answers within the 1,500 ms per-turn deadline or is reported unavailable; no answer reaches another session (zero cross-session cache hits). A rate limit (429), an overload (529), CLEF's used-up daily free allocation, a revoked key (401) and no network each keep the agent working with no advice, and show the reason.
- **Automatic only where both gates pass.** A site runs automatically only when it is in both `PASSED_GATE` and `PAIRED_PASSED` (`decisions/sites.ts`); the rest stay on demand, and Board supervision, which has no on-demand call, stays off. Inside a session, automatic delivery is only the relevance site (UserPromptSubmit advice, #463); next-step and evidence are tool calls, on demand. A person may opt into automatic decisions at sites that passed the quality gate but not yet this one (`decisions.experimental`, Settings > Smarter decisions > Experimental), each answer marked experimental. Settings, the session details and `mesa decisions status` show each site's mode and what it measured (`decisions/measured.ts`).

## Method: paired workflows

`scripts/decisions/paired/` (all invented):

- **Project**: `kelp-ledger`, a small Node ESM shipment ledger with six stub modules (`project/`). Its `.claude/settings.json` pins the main model, `sonnet`, so every arm runs the same one; its own skill `paired-task` carries the task, so each run is a Mesa skill run.
- **Notes**: ten project notes (`notes/`, `project: kelp-ledger`), written into the profile's vault under `wiki/decisions/` for every arm. Six hold one task's convention each; four are distractors (warehouse codes, courier webhooks, test style, releases). Each fits whole in the 200 characters Mesa sends per source.
- **Tasks** (`tasks/<id>/`): `format-amount`, `shipment-id`, `retry-manifest`, `log-line`, `sort-shipments`, `parse-weight`. Each prompt names the function and file but not the convention. Each has a hidden `node:test` (copied in only after the run) that checks behaviour and the convention, a reference solution that passes it, and a naive, convention-blind one that fails it. `pnpm decisions:paired:check` proves all three for every task, and a vitest test runs the same check in CI.
- **Runner** (`run.mjs`): arms `off` (`mesa decisions use none`), `jev` and `clef`, 2 repetitions each, in an order shuffled by a seeded generator (the seed is printed and saved). Each run copies the project fresh, switches only the Decision model, runs `mesa run paired-task --project kelp-ledger -- "<task>"` (headless Claude Code, `claude -p`, edits accepted, `--allowedTools` Bash limited to `node`, `ls` and `cat`, from the profile's `run` settings), waits for it to end, then runs the hidden test. Advice reaches the run by the product path, Claude Code's `UserPromptSubmit` hook (`docs/spikes/decision-assistance-providers.md`, Headless: pass), so Mesa's hooks must be installed. Per run it records the arm, task, repetition, success, wall time, Claude's turns, main-model tokens and cost (from the run's result), the Decision model's calls, input tokens and dollars and each use's status and reason (from the session's decisions file), and whether advice was delivered. It prints and saves per arm successes and time per solved task, and the verdict per model from core's `pairedVerdict`, with the lines to paste into `measured.ts` and `sites.ts` once accepted.
- During the run the profile has `decisions.experimental: true`, since no site is proven before this gate; the runner sets it, the run permissions and the notes, and puts them back afterwards.

## Commands

All on the throwaway profile `p11-live` (keys for both models already set; never the default or work profile). `$MESA` is the worktree's CLI.

```sh
export MESA="node $HOME/Developer/personal/mesa-465/packages/cli/dist/mesa.js"
cd ~/Developer/personal/mesa-465
pnpm --filter @mesa/core --filter @mesa/cli build
```

### 1. Held-out re-check (test plan 1)

```sh
pnpm decisions:evaluate --backend jev --dataset heldout --json > <scratch>/heldout-jev.json
pnpm decisions:evaluate --backend clef --dataset heldout --json > <scratch>/heldout-clef.json
```

Expected: every site `gate: true` for both, as in #638 (keys from the environment, as there).

### 2. Paired workflows

```sh
pnpm decisions:paired:check                       # the material: every task ok, 10 notes
pnpm decisions:paired --dry-run --seed 465        # the orchestration with a stub agent, no Mesa
# Mesa's hooks, with a byte-for-byte backup and restore:
cp -p ~/.claude/settings.json <scratch>/claude-settings.json && shasum -a 256 ~/.claude/settings.json
$MESA --profile p11-live hooks install --json
pnpm decisions:paired --profile p11-live --hooks-installed --out <scratch>/paired.json
cp -p <scratch>/claude-settings.json ~/.claude/settings.json && shasum -a 256 ~/.claude/settings.json
```

36 runs (3 arms x 6 tasks x 2), each up to 15 minutes (`--timeout 900`). Without `--hooks-installed`, or with the flag but no `UserPromptSubmit` hook installed, the runner refuses. `--arms off,jev` or `--arms off,clef` runs one model at a time (off always runs: it is the baseline); the gate needs the same tasks and repetitions in both arms. Ctrl-C puts the profile back.

### 3. Concurrency against the hosted model

```sh
for model in jev clef; do
  $MESA --profile p11-live decisions use $model --json
  for n in 1 4 8; do
    pnpm decisions:concurrency --profile p11-live --sessions $n --turns 5 --out <scratch>/conc-$model-$n.json
  done
done
```

Each plants N invented live Claude session records on `kelp-ledger` (no window, no agent) and runs their `UserPromptSubmit` hooks at once, `mesa hook claude` with a hook payload on stdin, timed from spawn to exit: first with each session turned off (the hook's fixed cost of starting node and Mesa), then assisted, a new prompt every turn so each is a live ask. It needs no hooks installed. It removes the records, their decision and event files and the notes it wrote, and puts `decisions.experimental` back.

### 4. Hosted failure modes (simulated, never on a real account)

```sh
pnpm exec vitest run packages/core/src/decisions/hosted-failures.test.ts packages/core/src/decisions/systemone.test.ts
```

Over the http fake and the testing clock: 429, 529, CLEF's daily free allocation used up (Workers AI's documented refusal: HTTP 429 with internal code 3036, "You have used up your daily free allocation of 10,000 neurons", in Cloudflare's `{ success: false, errors: [{ code, message }] }` envelope; code 3040 is "out of capacity"), 401 and no network, each with 1, 4 and 8 sessions asking at once.

### 5. Packaged app (test plan 3 and 4)

```sh
pnpm verify
APPLE_SIGNING_IDENTITY=- pnpm release:build        # ad-hoc signed test build, no secrets
APP=apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos/Mesa.app
# No model weights and no Python runtime in the bundle:
du -sh "$APP"
find "$APP" -type f \( -iname '*.safetensors' -o -iname '*.gguf' -o -iname '*.bin' -o -iname '*.pt' -o -iname '*.pth' -o -iname '*.onnx' -o -iname '*.mlmodel*' -o -iname '*.npz' \) -print
find "$APP" \( -iname 'python*' -o -iname '*.py' -o -iname '*.pyc' -o -iname 'site-packages' -o -iname 'libpython*' -o -iname 'Python.framework' \) -print
find "$APP" -type f -size +20M -exec du -h {} +
```

Expected: both `find`s print nothing, and the large files are only the app's own binary and the `mesa` executable (a Node single executable) in `Contents/MacOS`.

Then, from Finder, on a disposable profile (a Finder launch has no `MESA_PROFILE`; `open -n -a "$APP" --env MESA_PROFILE=p11-app` starts it the way Finder does, with only that variable added):

1. Settings > Smarter decisions: add the TypeSafe key, Test and save; it shows only its last 4. Add the Cloudflare token and account ID the same way.
2. Use this one on Jev, then on CLEF; each card lists every site with its mode and measured result.
3. One real decision per qualified site: open a session on an invented project with one invented note, and use relevance (Preview context in the session details), next-step and evidence (`decision_evaluate` from the session, or `mesa --profile p11-app decisions advise next-step|evidence --session <id>`), and supervision (with Experimental on, a session whose screen the rules cannot place).
4. Remove each key: the model moves to the other, then to None (rules only); a session's details then say no Decision model.
5. The keys never leave the Keychain: `grep -rF "<last 8 of each key>" ~/.mesa/p11-app ~/Library/Logs ~/Library/Application\ Support/Mesa 2>/dev/null` prints nothing, and `security find-generic-password -s mesa-p11-app-decisions -a typesafe` finds the item until it is removed.
6. Cleanup: remove the profile's sessions and project, `tmux -L mesa-p11-app kill-server`, delete `~/.mesa/p11-app` and the invented project, remove the Keychain items if any remain.

## Results

### Held-out re-check

| Model | supervision | relevance | next-step | evidence | Same verdicts as #638 |
| --- | --- | --- | --- | --- | --- |
| jev-1.13.0 | 26 accepted, 26 right (86.7%): pass | 27, 27 (90%): pass | 30, 29 (100%): pass | 26, 25 (86.7%): pass | yes |
| clef | 30, 30 (100%): pass | 27, 27 (90%): pass | 29, 29 (96.7%): pass | 26, 25 (86.7%): pass | yes |

Run on 2026-10-07 with `pnpm decisions:evaluate --backend jev|clef --profile p11-live --dataset heldout --json` (the keys read from the profile's Keychain item, as Mesa reads them). The model ids are unchanged (`jev-1.13.0`, `clef`), so no new calibration was needed. CLEF's numbers equal #638's; Jev's differ by one case at three sites (relevance 27 accepted against 28, next-step 30 accepted with 29 right against 29 and 29, evidence 25 right against 26), as a sampled model does, and every verdict is the same.

### Paired workflows

Seed: 1476997429. Claude Code 2.1.292, main model `sonnet` in every arm, 2026-10-07, profile `p11-live`, Mesa at the branch head. Results file: kept by the lead, not committed (it names local paths).

| Arm | Solved | Total wall | Time per solved task | Advice delivered | Decision calls | Decision input tokens | Decision $ | Main-model tokens (in / out) | Main-model $ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| off | 0/12 | 292.0 s | unbounded | n/a | 0 | 0 | 0 | 2,420,742 / 15,897 | $1.676 |
| jev | 12/12 | 221.4 s | 18.4 s | 12/12 | 12 | 13,698 | $0.00058 | 1,809,914 / 13,899 | $1.526 |
| clef | 12/12 | 221.5 s | 18.5 s | 12/12 | 12 | 11,632 | $0.00279 | 1,705,024 / 13,617 | $1.494 |

Main-model input tokens include cache reads and writes.

| Model | Successes vs off | Time per solved task vs off | Paired gate |
| --- | --- | --- | --- |
| jev | +12 (12 against 0) | 18.4 s against unbounded | pass |
| clef | +12 (12 against 0) | 18.5 s against unbounded | pass |

Per task (solved runs out of 2 per arm): format-amount, log-line, parse-weight, retry-manifest, shipment-id and sort-shipments each off 0/2, jev 2/2, clef 2/2. Without advice the agent never read the project's notes and every hidden test failed on its convention, as in the #459 pilot; with advice it was told the right note at the first prompt. The advice also made each run cheaper on the main model (about 9 to 11% fewer dollars), since the agent explored less.

### Concurrency (hook wall time, spawn to exit)

| Model | Sessions | Off p50 / p95 | Assisted p50 / p95 / max | Added p50 / p95 | Answered | Unavailable (reasons) | Cross-session cache hits | Gate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| jev | 1 | 294 / 308 ms | 486 / 512 / 512 ms | 192 / 204 ms | 5/5 | 0 | 0 | pass |
| jev | 4 | 334 / 342 ms | 575 / 604 / 609 ms | 241 / 262 ms | 20/20 | 0 | 0 | pass |
| jev | 8 | 420 / 456 ms | 715 / 752 / 768 ms | 295 / 296 ms | 40/40 | 0 | 0 | pass |
| clef | 1 | 294 / 317 ms | 707 / 966 / 966 ms | 413 / 649 ms | 5/5 | 0 | 0 | pass |
| clef | 4 | 339 / 404 ms | 852 / 1,068 / 1,410 ms | 513 / 664 ms | 20/20 | 0 | 0 | pass |
| clef | 8 | 437 / 498 ms | 972 / 1,182 / 1,271 ms | 535 / 684 ms | 40/40 | 0 | 0 | pass |

5 turns per session, `pnpm decisions:concurrency --profile p11-live --sessions 1|4|8 --turns 5`, once with `decisions use jev` and once with `clef`, 2026-10-07. Every assisted hook, the whole process from spawn to exit, stayed within the 1,500 ms per-turn deadline (the slowest: 1,410 ms, CLEF with 4 sessions); no hook was killed and no call was unavailable.

### Hosted failure modes (simulated)

`packages/core/src/decisions/hosted-failures.test.ts`, with 1, 4 and 8 sessions each:

| Case | Reason shown (session decision status) | Turn goes on, no advice | Cross-session cache hits |
| --- | --- | --- | --- |
| Rate limit (Jev 429) | Jev rate limit reached (HTTP 429) | yes | 0 |
| Overload (Jev 529) | Jev is overloaded (HTTP 529) | yes | 0 |
| CLEF daily free allocation used up (429, code 3036) | CLEF daily free allocation is used up (HTTP 429): it resets at 00:00 UTC, or move to Workers Paid | yes | 0 |
| Revoked key (Jev 401) | Jev rejected the key (HTTP 401) | yes | 0 |
| No network | Jev could not be reached | yes | 0 |

Once the model answers again, each session asks for itself and reads only its own ready answer (same test file).

### Packaged app

| Check | Result |
| --- | --- |
| `du -sh` of Mesa.app | 312 MB (Mesa 0.1.7, build 320, ad-hoc signed `APPLE_SIGNING_IDENTITY=- pnpm release:build`, 2026-10-07); the only file over 20 MB is `Contents/MacOS/mesa`, the Node single executable (297 MB) |
| Model weights in the bundle | none (the `find` for `*.safetensors`, `*.gguf`, `*.bin`, `*.pt`, `*.pth`, `*.onnx`, `*.mlmodel*`, `*.npz` prints nothing) |
| Python runtime in the bundle | none (the `find` for `python*`, `*.py`, `*.pyc`, `site-packages`, `libpython*`, `Python.framework` prints nothing) |
| Add and test a key (Jev, CLEF) | pending live run |
| Switch Jev and CLEF | pending live run |
| One real decision per qualified site | pass, through the app's own `Contents/MacOS/mesa` on profile `p11-live`, an invented project with two invented notes and a live session with a saved goal: relevance picked the tide-cache note over the icon note (CLEF answered from the answer prepared at launch, 0 ms; Jev 146 ms), next-step picked `invalidate-on-harbour` over deleting the cache, evidence accepted a claim backed by a passing test, each accepted by both models; `mesa decisions status` shows relevance automatic, next-step and evidence on demand |
| Remove a key, back to rules | pending live run |
| Keys only in the Keychain | pass: 0 files under `~/.mesa/p11-live`, `~/Library/Logs`, `~/Library/Application Support/Mesa` and `~/Library/Caches/Mesa` contain either key (searched for the whole key, never printed) |
| Cleanup | pending live run |

## Which sites become automatic

Both models passed the paired gate at `relevance`, the only site Mesa delivers automatically inside a session, so `PAIRED_PASSED` is `['relevance']` for `jev` and `clef` and `PAIRED` in `decisions/measured.ts` holds the numbers above (a test checks the two agree). `relevance` is therefore automatic for both models; `next-step` and `evidence` passed the quality gate but are tool calls the agent makes, not measured by these workflows, so they stay on demand; `supervision` on the Board was not measured by them either and stays off unless the profile opts into experimental automatic decisions. Settings and the session details show each site's mode with both measured results.

## Epic #458: criteria and evidence

| Epic criterion | Merged work | Evidence |
| --- | --- | --- |
| One System One client answers through Jev and CLEF; per-site quality on the held-out split against the frozen gates | #638 | `docs/spikes/jev-clef-qualification.md` |
| Keys set, tested, masked and removed from the CLI and Settings; the person picks the model; no key means no network call | #488 | `decisions/keys.ts`, `decisions/models.ts` tests; Settings > Smarter decisions |
| Qualified sites run: supervision beside the Board, scoped context, next-step and evidence through CLI and MCP, delivered to Claude Code, Codex and Antigravity | #461, #462, #463 | `docs/spikes/decision-assistance-providers.md` |
| Paired workflows show a gain under the frozen gate; hosted failure modes keep agents working; a Finder-launched packaged app passes setup, use and removal | #465 | this report (pending live run) |
| Sites that miss a gate stay off or on demand, with their measured result shown; gates never lowered | #465 | `decisions/sites.ts` (`PAIRED_PASSED`, `automaticSites`), `decisions/measured.ts`, Settings and session details |
