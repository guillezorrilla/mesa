# Decision assistance evaluation: paired workflows, concurrency and the packaged app (#465)

Status: live run on 2026-10-07. Mac: Apple M1 Pro, macOS 26.6.2. Claude Code: 2.1.292. Mesa: branch `decisions/workflow-gains`. The packaged app was launched the way Finder launches it (`open -n -a Mesa.app --env MESA_PROFILE=p11-live`). On 2026-10-08 the owner connected CLEF through the app window (the redesigned Settings > Smarter decisions, Connect dialog, build 326); the other steps ran through the app's own bundled `Contents/MacOS/mesa`, the binary its UI calls for every action. Decision models: `jev-1.13.0` and `clef` (27B), the ids #638 qualified (`SYSTEM_ONE_MODELS`); a changed id means a new calibration and held-out run first.

## What is being proven

ADR-0019's frozen gates, which are never lowered:

- **Quality** (held-out split, per site): already measured in `docs/spikes/jev-clef-qualification.md`. Both models passed every site (`PASSED_GATE`). Test plan 1 re-checks it below.
- **Paired workflows** (`PAIRED_GATE`, `decisions/evaluation/paired.ts`): at least 6 invented coding tasks, assistance off and on, the same main model and setup, randomised order, 2 repetitions per arm. Assistance passes only if its successes are at least as many as without, its time per successful task (the arm's total wall time over its successes; unbounded with none) is no more than 10% worse, and it solves at least one more task or is at least 10% faster per solved task. More decision calls or faster answers alone never count.
- **Concurrency and safety** (hosted): with 1, 4 and 8 concurrent sessions, every request answers within the 1,500 ms per-turn deadline or is reported unavailable; no answer reaches another session (zero cross-session cache hits). A rate limit (429), an overload (529), CLEF's used-up daily free allocation, a revoked key (401) and no network each keep the agent working with no advice, and show the reason.
- **Automatic only where both gates pass.** A site runs automatically only when it is in both `PASSED_GATE` (`decisions/sites.ts`) and `PAIRED_PASSED` (read from the measured arms in `decisions/measured.ts`), by one rule, `siteMode` (`decisions/site-mode.ts`); the rest stay on demand, and Board supervision, which has no on-demand call, stays off. Inside a session, automatic delivery is only the relevance site (UserPromptSubmit advice, #463); next-step and evidence are tool calls, on demand. A person may opt into automatic decisions at sites that passed the quality gate but not yet this one (`decisions.experimental`, Settings > Advanced > Try unproven automatic decisions), each answer marked experimental. Settings, the session details and `mesa decisions status` show each site's mode and what it measured (`decisions/measured.ts`).

## Method: paired workflows

`scripts/decisions/paired/` (all invented):

- **Project**: `kelp-ledger`, a small Node ESM shipment ledger with six stub modules (`project/`). Its `.claude/settings.json` pins the main model, `sonnet`, so every arm runs the same one; its own skill `paired-task` carries the task, so each run is a Mesa skill run.
- **Notes**: ten project notes (`notes/`, `project: kelp-ledger`), written into the profile's vault under `wiki/decisions/` for every arm. Six hold one task's convention each; four are distractors (warehouse codes, courier webhooks, test style, releases). Each fits whole in the 200 characters Mesa sends per source.
- **Tasks** (`tasks/<id>/`): `format-amount`, `shipment-id`, `retry-manifest`, `log-line`, `sort-shipments`, `parse-weight`. Each prompt names the function and file but not the convention. Each has a hidden `node:test` (copied in only after the run) that checks behaviour and the convention, a reference solution that passes it, and a naive, convention-blind one that fails it. `pnpm decisions:paired:check` proves all three for every task, and a vitest test runs the same check in CI.
- **Runner** (`run.mjs`): arms `off` (`mesa decisions use none`), `jev` and `clef`, 2 repetitions each, in an order shuffled by a seeded generator (the seed is printed and saved). Each run copies the project fresh, switches only the Decision model, runs `mesa run paired-task --project kelp-ledger -- "<task>"` (headless Claude Code, `claude -p`, edits accepted, `--allowedTools` Bash limited to `node`, `ls` and `cat`, from the profile's `run` settings), waits for it to end, then runs the hidden test. Advice reaches the run by the product path, Claude Code's `UserPromptSubmit` hook (`docs/spikes/decision-assistance-providers.md`, Headless: pass), so Mesa's hooks must be installed. Per run it records the arm, task, repetition, success, wall time, Claude's turns, main-model tokens and cost (from the run's result), the Decision model's calls, input tokens and dollars and each use's status and reason (from the session's decisions file), and whether advice was delivered. It prints and saves per arm successes and time per solved task, and the verdict per model from core's `pairedVerdict`, with the line to paste into `measured.ts` (the arms only; the verdict and `PAIRED_PASSED` are read from them) once accepted.
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

Run on 2026-10-07 with `pnpm decisions:evaluate --backend jev|clef --profile p11-live --dataset heldout --json` (the keys read from the profile's Keychain item, as Mesa reads them). The model ids are unchanged (`jev-1.13.0`, `clef`), so no new calibration was needed. CLEF's numbers equal #638's; Jev's differ by one case at three sites (relevance 27 accepted against 28, next-step 30 accepted with 29 right against 29 and 29, evidence 25 right against 26), as a sampled model does, and every verdict is the same. Settings, the session details and `mesa decisions status` show #638's held-out numbers (2026-10-05, `decisions/measured.ts`); this re-check gave the same verdicts, so they stand.

### Paired workflows

Seed: 1476997429. Claude Code 2.1.292, main model `sonnet` in every arm, 2026-10-07, profile `p11-live`, Mesa at the branch head. Results file: kept locally, not committed (it names local paths).

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

With 0 of 12 solved off, time per solved task off is unbounded, so under the frozen rule the time check cannot fail and the gate passes on successes (+12). Time per solved task with advice (18.4 s for Jev, 18.5 s for CLEF) is reported for future comparisons.

Per task (solved runs out of 2 per arm): format-amount, log-line, parse-weight, retry-manifest, shipment-id and sort-shipments each off 0/2, jev 2/2, clef 2/2. Without advice the agent never read the project's notes and every hidden test failed on its convention, as in the #459 pilot; with advice it was told the right note at the first prompt. The advice also made each run cheaper on the main model (about 9 to 11% fewer dollars), since the agent explored less.

Every run, in the order it ran (dollars at list price):

| # | Arm | Task | Rep | Result | Wall | Decision calls | Decision input tokens | Decision $ | Main-model tokens (in / out) | Main-model $ | Advice delivered |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | jev | sort-shipments | 2 | solved | 14.6 s | 1 | 1,135 | 0.000048 | 101,806 / 859 | 0.119 | yes |
| 2 | jev | parse-weight | 1 | solved | 25.8 s | 1 | 1,143 | 0.000048 | 245,056 / 2,051 | 0.160 | yes |
| 3 | clef | shipment-id | 2 | solved | 13.6 s | 1 | 965 | 0.000232 | 100,493 / 581 | 0.107 | yes |
| 4 | jev | shipment-id | 2 | solved | 15.6 s | 1 | 1,136 | 0.000048 | 136,031 / 753 | 0.119 | yes |
| 5 | jev | parse-weight | 2 | solved | 26.9 s | 1 | 1,143 | 0.000048 | 241,640 / 2,217 | 0.160 | yes |
| 6 | jev | shipment-id | 1 | solved | 12.6 s | 1 | 1,136 | 0.000048 | 100,465 / 509 | 0.106 | yes |
| 7 | jev | retry-manifest | 1 | solved | 15.7 s | 1 | 1,148 | 0.000048 | 102,207 / 1,007 | 0.115 | yes |
| 8 | jev | log-line | 1 | solved | 18.7 s | 1 | 1,149 | 0.000048 | 171,225 / 1,248 | 0.133 | yes |
| 9 | clef | sort-shipments | 2 | solved | 20.7 s | 1 | 963 | 0.000231 | 171,330 / 1,705 | 0.139 | yes |
| 10 | clef | format-amount | 2 | solved | 16.7 s | 1 | 966 | 0.000232 | 134,548 / 798 | 0.117 | yes |
| 11 | off | parse-weight | 2 | failed | 20.8 s | 0 | 0 | 0.000000 | 205,548 / 1,349 | 0.142 | no |
| 12 | off | sort-shipments | 1 | failed | 18.8 s | 0 | 0 | 0.000000 | 168,583 / 871 | 0.125 | no |
| 13 | clef | log-line | 2 | solved | 18.7 s | 1 | 975 | 0.000234 | 101,766 / 1,110 | 0.116 | yes |
| 14 | off | log-line | 2 | failed | 25.8 s | 0 | 0 | 0.000000 | 275,792 / 1,799 | 0.162 | no |
| 15 | clef | parse-weight | 2 | solved | 26.8 s | 1 | 972 | 0.000233 | 312,158 / 2,178 | 0.175 | yes |
| 16 | off | shipment-id | 2 | failed | 20.8 s | 0 | 0 | 0.000000 | 204,414 / 1,195 | 0.139 | no |
| 17 | jev | format-amount | 1 | solved | 14.6 s | 1 | 1,138 | 0.000048 | 133,915 / 596 | 0.114 | yes |
| 18 | clef | shipment-id | 1 | solved | 14.6 s | 1 | 965 | 0.000232 | 135,213 / 931 | 0.120 | yes |
| 19 | clef | log-line | 1 | solved | 17.6 s | 1 | 975 | 0.000234 | 137,428 / 1,131 | 0.125 | yes |
| 20 | clef | sort-shipments | 1 | solved | 15.7 s | 1 | 963 | 0.000231 | 101,015 / 800 | 0.111 | yes |
| 21 | jev | sort-shipments | 1 | solved | 18.7 s | 1 | 1,135 | 0.000048 | 135,862 / 1,515 | 0.127 | yes |
| 22 | clef | retry-manifest | 1 | solved | 15.7 s | 1 | 975 | 0.000234 | 101,906 / 936 | 0.114 | yes |
| 23 | off | retry-manifest | 2 | failed | 22.8 s | 0 | 0 | 0.000000 | 171,283 / 1,842 | 0.140 | no |
| 24 | off | format-amount | 1 | failed | 20.8 s | 0 | 0 | 0.000000 | 203,766 / 1,186 | 0.138 | no |
| 25 | jev | format-amount | 2 | solved | 17.6 s | 1 | 1,138 | 0.000048 | 168,243 / 788 | 0.124 | yes |
| 26 | off | shipment-id | 1 | failed | 20.7 s | 0 | 0 | 0.000000 | 240,381 / 1,595 | 0.153 | no |
| 27 | off | parse-weight | 1 | failed | 54.4 s | 0 | 0 | 0.000000 | 204,692 / 1,353 | 0.141 | no |
| 28 | clef | parse-weight | 1 | solved | 25.9 s | 1 | 972 | 0.000233 | 171,796 / 1,686 | 0.138 | yes |
| 29 | clef | format-amount | 1 | solved | 17.7 s | 1 | 966 | 0.000232 | 135,232 / 816 | 0.118 | yes |
| 30 | jev | retry-manifest | 2 | solved | 16.7 s | 1 | 1,148 | 0.000048 | 102,136 / 972 | 0.115 | yes |
| 31 | jev | log-line | 2 | solved | 23.8 s | 1 | 1,149 | 0.000048 | 171,328 / 1,384 | 0.134 | yes |
| 32 | off | retry-manifest | 1 | failed | 22.8 s | 0 | 0 | 0.000000 | 136,318 / 1,588 | 0.129 | no |
| 33 | off | sort-shipments | 2 | failed | 22.8 s | 0 | 0 | 0.000000 | 168,717 / 964 | 0.127 | no |
| 34 | off | format-amount | 2 | failed | 24.8 s | 0 | 0 | 0.000000 | 271,720 / 1,300 | 0.153 | no |
| 35 | clef | retry-manifest | 2 | solved | 17.7 s | 1 | 975 | 0.000234 | 102,139 / 945 | 0.115 | yes |
| 36 | off | log-line | 1 | failed | 16.7 s | 0 | 0 | 0.000000 | 169,528 / 855 | 0.127 | no |

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
| Add and test a key (Jev, CLEF) | pass: the owner clicked Connect on CLEF in the Finder-launched app (build 326) with the labelled Account ID and API token fields; the app tested and saved it and the row showed "In use · token ending df35"; the Keychain item exists, `key list` shows only `df35`, and a real `mesa decide` then answered from `clef` in 379 ms. An invalid token was rejected (`CLEF rejected the key (HTTP 401); the key was not saved`) and the saved key stayed (build 320). Jev's key was saved through the same Settings UI in #488 |
| Switch Jev and CLEF | pass: `decisions use jev` then `mesa decide` answered `backend: jev, model: jev-1.13.0`; `decisions use clef` answered `backend: clef, model: clef` |
| One real decision per qualified site | pass, through the app's own `Contents/MacOS/mesa` on profile `p11-live`, an invented project with two invented notes and a live session with a saved goal: relevance picked the tide-cache note over the icon note (CLEF answered from the answer prepared at launch, 0 ms; Jev 146 ms), next-step picked `invalidate-on-harbour` over deleting the cache, evidence accepted a claim backed by a passing test, each accepted by both models; `mesa decisions status` shows relevance automatic, next-step and evidence on demand |
| Remove a key, back to rules | pass: removing the TypeSafe key (Jev not in use) left `clef`; removing the Cloudflare token (in use) fell to `none`; both Keychain items gone; `mesa decide` answered `backend: rules` with even probabilities; the session's sites all `off`; Doctor `rules only` |
| Keys only in the Keychain | pass: after the owner's Connect in the app, 0 files under `~/.mesa/p11-live`, `~/Library/Logs`, `~/Library/Application Support/Mesa`, `~/Library/Caches/Mesa` and `~/Library/WebKit` contain the key; before, 0 files under `~/.mesa/p11-live`, `~/Library/Logs`, `~/Library/Application Support/Mesa` and `~/Library/Caches/Mesa` contain either key (searched for the whole key, never printed) |
| Cleanup | done: the invented session (`stop`, `rm`), project (`unregister`) and notes removed, `tmux -L mesa-p11-live kill-server`, the test app quit; the built app is deleted with its worktree |

## Which sites become automatic

Both models passed the paired gate at `relevance`, the only site Mesa delivers automatically inside a session, so `PAIRED_ARMS` in `decisions/measured.ts` holds the arms above and `PAIRED_PASSED`, read from them by the frozen gate, is `['relevance']` for `jev` and `clef`. `relevance` is therefore automatic for both models; `next-step` and `evidence` passed the quality gate but are tool calls the agent makes, not measured by these workflows, so they stay on demand. Board supervision (#461) now stays off unless the profile opts into experimental automatic decisions, because the paired workflows measure in-session relevance only; whether the relevance result should also count for supervision is the owner's call (ADR-0019, 2026-10-07 amendment). Settings and the session details show each site's mode with both measured results.

Update, 2026-10-08: Board supervision got its own paired workflows (#677) and passed for CLEF, so it is now automatic for CLEF by default; Jev's stays off until measured ([Board placement](#board-placement-2026-10-08)).

## Epic #458: criteria and evidence

| Epic criterion | Merged work | Evidence |
| --- | --- | --- |
| One System One client answers through Jev and CLEF; per-site quality on the held-out split against the frozen gates | #638 | `docs/spikes/jev-clef-qualification.md` |
| Keys set, tested, masked and removed from the CLI and Settings; the person picks the model; no key means no network call | #488 | `decisions/keys.ts`, `decisions/models.ts` tests; Settings > Smarter decisions |
| Qualified sites run: supervision beside the Board, scoped context, next-step and evidence through CLI and MCP, delivered to Claude Code, Codex and Antigravity | #461, #462, #463 | `docs/spikes/decision-assistance-providers.md` |
| Paired workflows show a gain under the frozen gate; hosted failure modes keep agents working; a Finder-launched packaged app passes setup, use and removal | #465 | this report: paired gate passed for both models at relevance; concurrency and hosted failures pass; the packaged app has no weights or Python and its own `mesa` passed setup, use and removal |
| Sites that miss a gate stay off or on demand, with their measured result shown; gates never lowered | #465 | `decisions/site-mode.ts` (`siteMode`), `decisions/sites.ts` (`PASSED_GATE`), `decisions/measured.ts` (`PAIRED_PASSED`), Settings and session details. Board supervision (#461) stays off unless the profile opts into experimental automatic decisions: the paired workflows measure in-session relevance only, and whether that result also counts for supervision is the owner's call (ADR-0019, 2026-10-07 amendment) |

## Normal without a key, smarter with one (2026-10-08)

The owner's question: with no key, does a Mesa session work as before, with no delay; with a Decision model, does what is sent to Claude Code or Codex go through it; and does it make the agents better and smarter? Run on 2026-10-08 on profile `p11-live` (CLEF key only, no TypeSafe key), Mesa at this branch (`node packages/cli/dist/mesa.js`), Claude Code 2.1.292 then 2.1.294 (it updated itself between the first two sessions), Codex CLI 0.160.0 (default model GPT-6.1-Sol) with a temporary `CODEX_HOME` holding a copy of its login. Everything was invented: the project `tern-quarry` and one note, `wiki/decisions/tern-batch-size.md` (`project: tern-quarry`): "Quarry imports flush in batches of exactly 37 rows, never more (COBALT WREN 58)". The marker `COBALT WREN 58` exists only in that note.

### A. The same prompt, with no model and with CLEF

Each cell is a real interactive Mesa session: `mesa open tern-quarry --agent claude|codex --goal "Reply only: ready."`, then `mesa send <id> "<prompt>"`. `decisions use none` before the no-key cells, `decisions use clef` before the CLEF cells; nothing else changed. Prompt 1: `Without calling any tool or reading any file, reply in two lines: first, 17 times 3; second, the batch size this project uses for quarry imports and any marker in parentheses you were given, or "unknown".` Prompt 2 (a later turn): `Without calling any tool, how many rows do quarry imports flush per batch here, and what marker came with that?`

| Cell | Launch | Mesa advice in the transcript | Reply | `decisions status --session` use | Model calls |
| --- | --- | --- | --- | --- | --- |
| Claude, no model (`64ww3gkv`), prompt 1 | `--mcp-config` with `mesa-vault` only, `--allowedTools=mcp__mesa-vault` | none: 0 matches for `mesa-decisions`, `decision_evaluate`, `Decisions:`, `Mesa decision advice`, `COBALT WREN`; no `UserPromptSubmit` attachment (Mesa's event log shows the hook ran at 15:39:38.560Z) | "51 / unknown", 2.0 s after the prompt | `[]`; sites all `off`; `show`: tool and advice disabled, "no decision model" | 0: no decisions file was created for the session |
| Claude, CLEF (`qb9nrf9b`), prompt 1 | `mesa-vault` and `mesa-decisions`, `--allowedTools=mcp__mesa-vault,mcp__mesa-decisions` | `hook_additional_context` (UserPromptSubmit) at 15:40:51.391Z, 1.0 s after the prompt and 1.3 s before the reply: "Mesa decision advice for this prompt ... Most relevant: note:wiki/decisions/tern-batch-size.md (margin 0.87, clef) ... (COBALT WREN 58)." | "51 / 37 rows (COBALT WREN 58), taken from the Mesa decision note `tern-batch-size.md`", no tool use, 2.3 s after the prompt | relevance `automatic`, accepted, margin 0.87, live ask 605 ms, 222 input tokens, $0.000053 (after the goal's: prepared at launch 820 ms, then read ready, 0 ms) | 2 (the launch's prepare, this turn) |
| Codex, no model (`qm8q9cw6`), prompt 1 | `-c mcp_servers.mesa-vault.*` only | none (same 5 searches: 0) | "51 / unknown" | `[]`; `show`: disabled | 0 |
| Codex, CLEF (`8z5yqk0v`), prompt 1 | `mesa-vault` and `mesa-decisions` overrides | `developer` message right after the user prompt (15:44:00.100Z), the same advice, margin 0.87 | "51 / unknown" (see below) | accepted, margin 0.87, live ask 376 ms, 222 tokens | 2 |
| Codex, CLEF (`8z5yqk0v`), prompt 2 | same | `developer` message after the prompt, margin 0.97 | "The supplied advice says 37 rows per batch, with marker (COBALT WREN 58). I haven't verified the note." | accepted, 549 ms, 198 tokens, $0.000048 | 1 |
| Codex, no model (`ad35c4jg`), prompt 2 | `mesa-vault` only | none | "I don't have the quarry import batch size or accompanying marker in this conversation, so I can't determine either without tools." | `[]` | 0 |

No model call without a key, proved two ways: the profile's `sessions/decisions/` folder gained no file for the no-key sessions (a session that asks gets one), and the installed `UserPromptSubmit` hook, run on the same real payload with the session's `MESA_SESSION_ID`, printed the same single newline (byte for byte, `cmp`) with and without network, under `sandbox-exec -p '(version 1)(allow default)(deny network-outbound (remote ip))'` (in which `curl https://api.cloudflare.com` fails at once), for Claude and for Codex. The same sandboxed hook with CLEF in use records `unavailable: CLEF could not be reached` after 44 ms: with a key the hook does ask, without one it never tries.

Surprise: Codex given the advice on prompt 1 still answered "unknown". The advice reached it (the `developer` message holds the marker, before its reply), but the prompt forbade reading files and the advice says "Read it before relying on it", so GPT-6.1-Sol declined to rely on it unverified; asked without that restriction (prompt 2) it used the advice and said it had not verified the note. Claude Code relied on the same advice at once. The paired coding tasks below, where the agent may read files, are the measure that matters.

### B. Turn latency: the hook with no key against the hook before decision assistance

The installed `UserPromptSubmit` hook, run as the provider runs it (`sh -c '<installed command>'`, the session's real payload on stdin with a new prompt each turn, so every CLEF turn is a live ask), timed from spawn to exit. 24 turns per agent; each turn ran every arm in a shuffled order:

- `v0.1.5 app`: the hook the owner had installed before this work, `/Applications/Mesa.app/Contents/MacOS/mesa hook claude|codex >/dev/null 2>&1` (Mesa 0.1.5, a Node single executable, before decision assistance), in a throwaway `HOME` holding a copy of the profile config (with the keys 0.1.5 does not know removed) and the no-key session's record; it records the event there, as it does in a real session.
- `pre-P11 CLI`: main at `d26de1c5` (the commit before decision assistance's first, #669), built from `git archive` and run with the same node launcher as the branch, in the same throwaway `HOME`.
- `no key (throwaway HOME)`: this branch's hook in that same `HOME` (no Decision model there).
- `no key`: this branch's installed hook on the real profile with `decisions use none`, on a live no-key session.
- `CLEF`: the same with `decisions use clef`, on a live CLEF session.

| Agent | v0.1.5 app | pre-P11 CLI | No key (throwaway HOME) | No key | CLEF (advice sent) |
| --- | --- | --- | --- | --- | --- |
| Claude Code | 187 / 202 ms | 358 / 419 ms | 345 / 394 ms | 342 / 427 ms | 855 / 1,571 ms (11 of 24) |
| Codex | 198 / 235 ms | 365 / 401 ms | 358 / 382 ms | 349 / 406 ms | 897 / 1,124 ms (12 of 24) |

p50 / p95 over 24 turns each; no hook failed or was killed. Load average about 8 during the run (Apple M1 Pro, macOS 26.6.2).

- **No key adds no time.** Against the same code before decision assistance, on the same launcher and in the same `HOME`, the no-key hook is equal within noise: Claude p50 345 ms against 358 ms (means 369 and 366 ms), Codex 358 against 365 ms (means 359 and 374 ms). On the real profile it is 342 and 349 ms.
- **The 0.1.5 app's hook is about 160 ms faster, and that is its launcher, not decision assistance**: the packaged app runs the hook from its single executable, the worktree from `node mesa.js` loading the built modules; the pre-P11 build on node costs the same as today's no-key hook. A packaged build of this branch runs the hook from its own single executable; it was not on this machine (the 0.1.7 test build was deleted with its worktree), so the like-for-like comparison is the node one above.
- **With CLEF** each turn asks the model live (the turns with an unrelated prompt get a `none` or abstained answer and send nothing): about 500 ms more at p50. Two Claude turns of 24 ran 1,571 and 1,607 ms, past the 1,500 ms per-turn deadline: their asks were cancelled (`unavailable: cancelled`) and nothing was sent, as designed, but the whole hook overran by about 70 to 110 ms on this loaded machine: the budget counts from the node process's start (`performance.timeOrigin`), so what is past it is the `sh` wrapper and the work after the deadline (cancelling the ask, recording it, exiting). Codex's slowest was 1,352 ms.

### C. Smarter: the paired workflows on Codex

The same harness, tasks, notes and hidden tests as the Claude Code run above, now with `--agent codex` (added for this run, `feat(decisions)` commit): each run is `mesa run paired-task --agent codex` on a fresh `kelp-ledger`, which Mesa runs as `codex exec --json -c approval_policy=never -c sandbox_mode=workspace-write` with Codex's default model (GPT-6.1-Sol), `mesa-vault` mounted in both arms and `mesa-decisions` only with CLEF; the skill is also placed under `.agents/skills`, where Codex reads it. Advice reaches it by Codex's `UserPromptSubmit` hook, trusted once in the interactive session of part A. Arms off and clef, 6 tasks x 2 repetitions, 24 runs.

```sh
export CODEX_HOME=<scratch>/codex-home       # a copy of ~/.codex/auth.json; Mesa's hooks trusted there
$MESA --profile p11-live hooks install --json  # after the cp -p backups below
pnpm decisions:paired --profile p11-live --agent codex --hooks-installed --arms off,clef --out <scratch>/paired-codex.json
```

Seed: 1285268906. Codex CLI 0.160.0, 2026-10-08, profile `p11-live`.

| Arm | Solved | Total wall | Time per solved task | Advice delivered | Decision calls | Decision input tokens | Decision $ | Main-model tokens (in / out; in includes cached) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| off | 3/12 | 725.5 s | 241.8 s | n/a | 0 | 0 | 0 | 1,754,947 / 8,284 |
| clef | 10/12 | 513.1 s | 51.3 s | 10/12 | 12 | 9,706 | $0.00233 | 1,325,862 / 7,663 |

| Model | Successes vs off | Time per solved task vs off | Paired gate (ADR-0019, `pairedVerdict`) |
| --- | --- | --- | --- |
| clef | +7 (10 against 3) | 51.3 s against 241.8 s (79% less) | pass: complete, successes not lower, time not worse, more successes and faster |

Per task (solved out of 2): format-amount off 0, clef 2; log-line off 0, clef 2; parse-weight off 1, clef 2; retry-manifest off 0, clef 2; shipment-id off 2, clef 2; sort-shipments off 0, clef 0.

- Every run CLEF advised was solved (10 of 10). The two CLEF runs that failed, both sort-shipments, got no advice: their live ask was cancelled at the per-turn deadline (`unavailable: cancelled`), so Codex worked without it, as the off arm does, and failed the same way. For Claude Code the same task's ask answered in time (12 of 12 advised).
- Codex without advice sometimes looked for the notes itself: the three off runs that called `mesa-vault`'s `project_context` and `read_note` are the three it solved; the other nine never read a note and failed on the convention. With advice it read the cited note (`read_note`) at once in every advised run.
- With advice Codex used 24% fewer main-model input tokens and 29% less wall time in all. Codex reports no dollar cost; CLEF cost $0.00023 per advised run.
- This repeats on Codex what the Claude Code run (above) showed: there, off 0/12 and CLEF 12/12 (seed 1476997429). `PAIRED_ARMS` in `decisions/measured.ts` still holds the Claude Code measurement; the Codex result agrees with it and changes no site's mode.

### Global files and cleanup

Before `mesa hooks install` (run with `CODEX_HOME` set to the scratch home, so Codex's hook file went there; its output listed `~/.claude/settings.json`, `~/.gemini/config/hooks.json`, `~/.gemini/config/mcp_config.json`, `~/.gemini/antigravity-cli/settings.json` and `<scratch>/codex-home/hooks.json`, nothing under `~/.codex`) each global file was copied with `cp -p` and hashed; after the runs each was restored from its copy (not `hooks uninstall`) and hashed again. `~/.codex` was hashed for comparison and never written.

```
553d0d42d3f91843299777f498db55acb6a0c1894c1ff0c902961371847516e0  ~/.claude/settings.json
4106c89cb4905ae564ce04cec5248aa6dd7d47b2b2d662906962efb70478ac8c  ~/.gemini/config/hooks.json
9ebf3f3661268f31657625e91ceb82813020592e0751e106852fdd973ec30be5  ~/.gemini/config/mcp_config.json
b08afe62666ac23b510d431bc47138b4092f8ed65b92236e13ce5e74627b861e  ~/.gemini/antigravity-cli/settings.json
abfe9a4ec5740c4a05e8c41b035b79da29035e99e7795f23ef0863435a2b4c14  ~/.codex/hooks.json
3edb73778aecb295326dc0b29940500236ed421761226bfb4dd6e1a8bd6bdcd3  ~/.codex/config.toml
```

Before and after equal (`diff` empty). While installed, `~/.claude/settings.json` was `e2252c9f...`, the three Antigravity files `b221a89f...`, `a6faa13e...` and `b2b6b778...`; `~/.codex` was unchanged throughout.

Cleanup: the eight invented sessions removed (`mesa rm --force`; the paired runner removed its own 26 runs, smoke included), `tern-quarry` unregistered and its note deleted (the profile's files and vault list the same files as before the run), `tmux -L mesa-p11-live kill-server`, the global files restored, the scratch folder deleted (the Codex home with its copied login, the throwaway `HOME` of part B and the pre-P11 build included). Profile `p11-live` keeps its CLEF key, model `clef`, `decisions.experimental` false. Left for the epic's final cleanup, as before: folder-trust entries for the scratch project in `~/.claude.json` and the native Claude Code transcripts of these sessions under `~/.claude/projects/` (invented content only).

### Verdict

- **No key: works as normal, no delay.** Claude Code and Codex launch without `mesa-decisions`, get no advice, answer as they did, and Mesa makes no model call (no decisions file; the same hook output with the network denied). The turn hook costs what the same code cost before decision assistance (Claude 345 against 358 ms p50, Codex 358 against 365 ms, same launcher and `HOME`).
- **A key: what is sent goes through the Decision model.** Every prompt to a CLEF session is asked of CLEF by the `UserPromptSubmit` hook, and its advice reaches the agent before the reply: Claude Code's `hook_additional_context`, Codex's `developer` message, each listed by `decisions status` as automatic use with model, margin, latency, tokens and cost.
- **Better and smarter, on both agents, under the frozen paired gate**: Claude Code 0/12 to 12/12, Codex 3/12 to 10/12 with time per solved task 241.8 s to 51.3 s. What it costs: about 500 ms more per turn at p50 while it asks, and fractions of a cent per turn.

## Per-turn deadline raised to 3,000 ms (2026-10-08)

The owner raised the hard per-turn deadline to 3,000 ms (ADR-0019, 2026-10-08 amendment). It now bounds the whole turn hook, from its start to its exit (`TURN_EXIT_MS` keeps 200 ms for printing and exiting). The 1,500 ms figure stays as the target for the added time at p95. Re-measured live with CLEF, 8 turns per session (`pnpm decisions:concurrency --profile p11-live --sessions 1|4|8 --turns 8`), load average about 8:

| Sessions | Hook p50 / p95 / max, assisted | Added p50 / p95 | Cross-session hits | Gate |
| --- | --- | --- | --- | --- |
| 1 | 860 / 961 / 961 ms | 522 / 587 ms | 0 | pass |
| 4 | 976 / 1,380 / 2,175 ms | 599 / 965 ms | 0 | pass |
| 8 | 1,127 / 1,578 / 1,759 ms | 566 / 941 ms | 0 | pass |

The slowest turn (2,175 ms) is one whose advice the old 1,500 ms deadline would have dropped. Before `TURN_EXIT_MS`, at the old deadline, two of 24 Claude hooks overran by 71 and 107 ms; with it, the slowest of 72 hooks took 1,453 ms at the old deadline.

## Board placement (2026-10-08)

The owner's question (#677): Board placement (the `supervision` site, #461) passed the held-out quality gate for both models; does it make sessions finish more often or faster under ADR-0019's frozen paired gate? If it does, it runs automatically by default; if not, it stays off with the result shown. Run on 2026-10-08 on profile `p11-live` (CLEF key only; no TypeSafe key, so no Jev arm), Mesa at branch `decisions/board-placement`, Codex CLI 0.160.0 with its default model (GPT-6.1-Sol), load average 5 to 19.

### Which agent, and why Codex

Placement is asked only for a session no hook and no listing speaks for, from its screen (`sessions/board/managed.ts`), and never for Antigravity. Claude Code never gets there: its listing (`claude agents --json --all`, `agents/claude/listing.ts`) gives every live session a state (`claudeListedState` always returns one, `working` at 0.5 for a status it does not know), and Mesa's Claude hooks are global (`~/.claude/settings.json`, installed by the packaged app), so they fire in every Mesa window of every profile. Codex's listing gives no state (`listing.state` is `() => undefined`), and its hooks are silent when Mesa's are not installed in its `CODEX_HOME` or not yet reviewed. So the honest test is Codex with a temporary `CODEX_HOME` that has no `hooks.json`; nothing is installed and no global file is written.

### Method

`pnpm decisions:paired --site supervision` (`scripts/decisions/paired/supervision/`, all invented):

- **Tasks**: the six kelp-ledger tasks and their hidden tests above, each now stopping once partway for a person (`supervision` in each `task.json`). Three are **questions** (format-amount, parse-weight, shipment-id): the goal says the convention is the person's call, written nowhere in the project, and asks the agent to ask first; the person's fixed answer is the task's note text. Three are **permission prompts** (log-line, retry-manifest, sort-shipments): the convention is kept only in `scripts/policy.mjs`, XOR-encoded so reading the file does not give it, and the goal says to run `node scripts/policy.mjs <topic>`; a `prefix_rule(... decision="prompt")` in the temporary `CODEX_HOME` makes Codex ask before it runs. No note is in the vault, and the runner refuses a vault that holds kelp-ledger notes.
- **Sessions**: each run is a real interactive Codex session in a Mesa window, `mesa open kelp-ledger --agent codex --goal "<task>"`, on a fresh copy of the project, with on-request approvals in Codex's workspace-write sandbox (the profile's `agents.codex`). The temporary `CODEX_HOME` holds a copy of `~/.codex/auth.json` (the real `~/.codex` is only read), no `hooks.json`, the project trusted, and the person's own skills, apps and plugins off, so a screen (and what the model reads) shows only the invented task. The runner refuses to start while the profile's tmux server runs, since its windows would not get that `CODEX_HOME`, and stops the server it started.
- **The simulated person** (`person.mjs`) acts only on what the Board says. Every 2 s it reads the session's row from `mesa sessions --json`; when the row wants placing (`supervision.pending`) it runs `mesa decisions place` beside the looks, one at a time and never awaited, as the app does (`useSessions`). On `waiting-permission` it presses Enter in the pane (Codex's highlighted choice is "Yes, proceed"); on `waiting-question` it sends the fixed answer with `mesa send <id> "<answer>" --force --no-from`, as a person. Once per wait, again only if the Board still shows it 20 s later; nothing on any other state.
- **Budget and success**: 300 s per task from `mesa open`. A run is solved when its hidden test passes on a copy of the project (the agent never sees it), checked whenever the screen shows Codex stopped; else it fails at the budget.
- **Waits and time to notice**: measured apart from the person, from the pane: Codex's screen reader says whether Codex has stopped (a dialog, or a turn that ended). Each stretch where Codex stopped with the task unsolved is a waiting episode; it is noticed at the first look whose Board row shows `waiting-permission` or `waiting-question`, to the nearest 2 s look. A stop seen on one look only, between two steps, is not counted.
- **Arms**: `off` is `mesa decisions use none`, the rules alone; `clef` is `decisions use clef` with `decisions.experimental` on (supervision was not yet proven, so it needs the opt-in to be asked). Same main model, sandbox, approvals, tasks and person; the order shuffled by a printed seed; 6 tasks x 2 repetitions per arm. The runner sets the profile's settings and puts them back. Records per run: success, wall time, each episode (its screen, the Board states seen, when it was noticed), the person's acts and whether Codex had really stopped, and the Decision model's calls, input tokens and dollars (placing calls from `mesa decisions place`, list price `inputCostUsd`; the session's own from its decisions file). The verdict is core's `pairedVerdict`, unchanged.

```sh
pnpm decisions:paired --site supervision --dry-run --seed 461                  # stub agent, virtual clock
pnpm decisions:paired --site supervision --profile p11-live --arms off,clef     # live
```

A smoke run first (seed 7, 2 tasks x 1 repetition per arm, 240 s) checked the loop end to end; it is not part of the result.

### Results

Seed 1488018697. 24 runs, 12 per arm.

| Arm | Solved | Total wall | Time per solved task | Waits | Unnoticed | Median time to notice | Acts on a working agent | Model calls | Input tokens | $ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| off | 6/12 | 2,017.2 s | 336.2 s | 12 | 6 | 0 s | 0 | 0 | 0 | 0 |
| clef | 8/12 | 1,504.7 s | 188.1 s | 15 | 4 | 2 s | 0 | 221 | 114,003 | $0.0274 |

| Model | Successes vs off | Time per solved task vs off | Paired gate (ADR-0019, `pairedVerdict`) |
| --- | --- | --- | --- |
| clef | +2 (8 against 6) | 188.1 s against 336.2 s (44% less) | pass: complete, successes not lower, time not worse, more successes and faster |

By kind of stop:

| Stop | off solved | clef solved | First waits noticed, off | First waits noticed, clef |
| --- | --- | --- | --- | --- |
| Permission prompt (3 tasks x 2) | 6/6 | 6/6 | 6 of 6 (0 s x 4, 2 s x 2) | 6 of 6 (0 s x 4, 2 s x 2) |
| Question (3 tasks x 2) | 0/6 | 2/6 | 0 of 6 | 5 of 6 (2 s x 3, 4 s x 2) |

Every run (time to notice per waiting episode; model calls, tokens and dollars include the session's own relevance call where it made one):

| # | Arm | Task | Stop | Result | Wall | Waits noticed | Calls | Input tokens | $ | Why it failed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | off | log-line | permission | solved | 31.3 s | 2 s | 0 | 0 | 0 | |
| 2 | off | format-amount | question | failed | 300.6 s | unnoticed | 0 | 0 | 0 | the Board showed the question as idle |
| 3 | clef | retry-manifest | permission | solved | 43.3 s | 2 s | 22 | 11,802 | $0.00283 | |
| 4 | clef | shipment-id | question | solved | 53.2 s | 2 s | 26 | 13,634 | $0.00327 | |
| 5 | off | sort-shipments | permission | solved | 33.3 s | 0 s | 0 | 0 | 0 | |
| 6 | clef | format-amount | question | solved | 37.2 s | 4 s | 18 | 9,068 | $0.00218 | |
| 7 | off | parse-weight | question | failed | 300.6 s | unnoticed | 0 | 0 | 0 | the Board showed the question as idle |
| 8 | clef | shipment-id | question | failed | 300.7 s | 4 s; unnoticed | 15 | 7,940 | $0.00191 | answered; Codex then stopped again, on a screen CLEF read as a question at 0.75 but abstained on (margin 0.70, under 0.762), so the Board kept idle |
| 9 | clef | log-line | permission | solved | 33.2 s | 2 s | 17 | 9,154 | $0.00220 | |
| 10 | clef | format-amount | question | failed | 300.7 s | unnoticed | 6 | 2,333 | $0.00056 | CLEF did not answer within 3,000 ms on the question's screen; that reply stands for the screen, which did not change, so it was not asked again |
| 11 | clef | parse-weight | question | failed | 300.6 s | 2 s; unnoticed | 21 | 10,808 | $0.00259 | answered; Codex's `parseWeight` failed the hidden test and it stopped idle, which the Board showed |
| 12 | clef | parse-weight | question | failed | 300.7 s | 2 s; unnoticed | 23 | 11,830 | $0.00284 | the same |
| 13 | clef | retry-manifest | permission | solved | 41.3 s | 0 s | 22 | 10,959 | $0.00263 | |
| 14 | clef | sort-shipments | permission | solved | 33.3 s | 0 s | 18 | 9,905 | $0.00238 | |
| 15 | off | log-line | permission | solved | 37.3 s | 2 s | 0 | 0 | 0 | |
| 16 | clef | sort-shipments | permission | solved | 29.3 s | 0 s | 16 | 7,709 | $0.00185 | |
| 17 | off | sort-shipments | permission | solved | 33.2 s | 0 s | 0 | 0 | 0 | |
| 18 | off | shipment-id | question | failed | 300.7 s | unnoticed | 0 | 0 | 0 | the Board showed the question as idle |
| 19 | off | retry-manifest | permission | solved | 41.2 s | 0 s | 0 | 0 | 0 | |
| 20 | off | parse-weight | question | failed | 300.5 s | unnoticed | 0 | 0 | 0 | the Board showed the question as idle |
| 21 | off | retry-manifest | permission | solved | 37.2 s | 0 s | 0 | 0 | 0 | |
| 22 | off | shipment-id | question | failed | 300.6 s | unnoticed | 0 | 0 | 0 | the Board showed the question as idle |
| 23 | off | format-amount | question | failed | 300.7 s | unnoticed | 0 | 0 | 0 | the Board showed the question as idle |
| 24 | clef | log-line | permission | solved | 31.3 s | 0 s | 17 | 8,861 | $0.00213 | |

- **Where the rules already read the screen right, placement adds nothing, and that alone fails the gate.** Codex's approval dialog ("Would you like to run the following command?") is in the rules' screen reader (`agents/codex/screen.ts`): both arms noticed all six permission waits at once and solved all six. On those tasks alone the arms tie, and a tie fails ADR-0019's gate (no +1 success, no 10% less time).
- **The gain is the questions.** A Codex turn that ends with a question looks like any finished turn to the rules (the empty composer, `idle`), so with placement off the Board showed every question as idle and the person, who acts only on waits, never answered: 0 of 6. With CLEF the Board showed 5 of the 6 first questions as `waiting-question` within 2 to 4 s; 2 of those runs were solved, 2 failed later on the task itself (after the answer, Codex's `parseWeight` failed the hidden test), and 1 on a second stop CLEF abstained on. The one question it missed was a CLEF timeout (3,000 ms) whose fallback stands for that screen.
- **No false waits.** In neither arm did the Board show a wait while Codex was working: the person never acted on a working agent.
- **What it costs.** Every changed screen of an unsure session is asked while the Board looks, so a 30 to 50 s run made 15 to 26 calls (217 placing calls in all, 216 answered, 185 accepted), about 520 input tokens each: $0.0274 for the 12 runs at the paid list price, $0.0023 a run. Each session is capped at 60 asks an hour (`ASKS_PER_HOUR`); CLEF's free daily allocation (about 450k input tokens) covers about 15 hours of one unsure session at that cap. Claude Code sessions, and Codex sessions whose hooks run, are never asked.
- **What the person stands for.** The simulated person is the issue's: it looks only at what the Board flags as waiting and never opens an idle session. A real person would find an idle Codex question in the end, so the off arm's question runs end at the 300 s budget rather than never; the result is that within the budget, with placement on, two more tasks were solved and each solved task took 44% less time. 12 runs per arm is ADR-0019's minimum.

### Verdict and what changed

Placement passes the paired gate for CLEF (8 against 6 solved, 188.1 s against 336.2 s per solved task). `PAIRED_ARMS` in `decisions/measured.ts` holds these arms under `supervision` for `clef`, so `PAIRED_PASSED.clef` is `['supervision', 'relevance']` and `siteMode` makes Board placement automatic for CLEF by default, with no opt-in; Settings > Smarter decisions > How it performed shows the result. Jev was not measured (no TypeSafe key on the profile): its placement stays off unless the profile opts into experimental decisions.

### Global files and cleanup

`mesa hooks install` was never run, and no global file was written: Codex ran with the runner's temporary `CODEX_HOME`, removed at the end. SHA-256 before the work and after the cleanup, equal (`diff` empty):

```
599b6f8dcfb30cf069198294129231df68202c1390bd9ad3eb4bd652bd00e51b  ~/.codex/hooks.json
3edb73778aecb295326dc0b29940500236ed421761226bfb4dd6e1a8bd6bdcd3  ~/.codex/config.toml
553d0d42d3f91843299777f498db55acb6a0c1894c1ff0c902961371847516e0  ~/.claude/settings.json
4106c89cb4905ae564ce04cec5248aa6dd7d47b2b2d662906962efb70478ac8c  ~/.gemini/config/hooks.json
9ebf3f3661268f31657625e91ceb82813020592e0751e106852fdd973ec30be5  ~/.gemini/config/mcp_config.json
b08afe62666ac23b510d431bc47138b4092f8ed65b92236e13ce5e74627b861e  ~/.gemini/antigravity-cli/settings.json
```

Cleanup: the runner removed its 28 sessions (smoke included, `mesa rm --force`), unregistered `kelp-ledger`, put back `agents.codex`, `decisions.experimental` and the model, stopped `tmux -L mesa-p11-live` and deleted its temporary folders (the project copies and the `CODEX_HOME` with its copied login). Three earlier probe sessions and their project (`tidewell`) were removed by hand, and the placements left in `p11-live/placements.json` for the removed sessions were deleted. Profile `p11-live` keeps its CLEF key, model `clef`, `decisions.experimental` false.
