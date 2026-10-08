# Smarter decisions: Jev and CLEF

Mesa makes small judgments all the time: which state a session is in, which project note matters for a prompt, whether a next step or a claim of "done" holds up. Its rules make them by default. With a key, a hosted decision model can make them better: **Jev** from TypeSafe, or **CLEF** from Cloudflare Workers AI. Both answer typed questions with calibrated probabilities. Neither writes text or code, and neither replaces the model behind Claude Code, Codex or Antigravity.

Decision models are optional. With no key, Mesa asks no model, sends nothing anywhere, and your agents work as they always do.

## What each one does

Jev and CLEF answer the same four kinds of question, called decision sites:

| Site | What it decides | Where you see it |
| --- | --- | --- |
| Session state | Which state a session is in, from its screen, when its hooks and the agent listing say nothing | The Board, beside the rules' reading |
| Source relevance | Which of the project's vault notes matters for a prompt or goal | Advice added to an agent's turn, and Preview context in the session details |
| Next step | Which of the steps an agent offers comes next, or whether to stop and ask | The `decision_evaluate` tool and `mesa decisions advise next-step` |
| Completion evidence | Whether the evidence an agent shows supports its claim that work is done | The `decision_evaluate` tool and `mesa decisions advise evidence` |

Mesa acts on an answer only when the model is sure enough; otherwise it gives no advice and the rules stand. Advice never runs a command, approves a permission or marks work complete.

A site runs **automatically** only after it has passed both of Mesa's tests: a quality check on invented cases, and paired coding workflows that show agents solve more tasks, or the same tasks faster, with it than without it ([ADR-0019](adr/0019-local-decision-model.md), [evaluation](spikes/decision-assistance-evaluation.md)). Until then a site works **on demand** only, when an agent or you ask. Settings > Smarter decisions lists each site with its mode and what it measured, under **How it performed** on each model. To try automatic decisions before they are proven, turn on **Try unproven automatic decisions** in Settings > Advanced (or `mesa config set decisions.experimental true`); that advice is marked experimental.

## Setup

In the app: **Settings > Smarter decisions** (or the tip on the Sessions view, or Set up smarter decisions in the command palette), then **Connect** on CLEF or Jev. The dialog says where to find each field: for CLEF the Cloudflare account ID and a Workers AI API token, for Jev a TypeSafe API key. **Connect** saves a key only after one test call answers, keeps it only in the macOS Keychain, and the row then shows only its last 4 characters. The first key you add is used; with both, choose **Use** on the row you want. Replace, Stop using and Disconnect are in the row's menu.

From the command line (the key comes from a hidden prompt or stdin, never an argument):

```sh
mesa decisions key set typesafe                                   # Jev: paste the TypeSafe key
printf %s "$CLOUDFLARE_API_TOKEN" | mesa decisions key set cloudflare --account <account id>
mesa decisions key list                                           # set or not, last 4, when added
mesa decisions use jev                                            # or clef, or none
```

- **Jev**: create an API key at [console.typesafe.ai/keys](https://console.typesafe.ai/keys).
- **CLEF**: create an API token with Workers AI access at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens), and copy your account ID from the [dashboard](https://dash.cloudflare.com/) overview. The account ID is kept in the profile's `config.yaml`; it is not a secret.

A session started before you added a key cannot gain the decision tool while it runs: stop it and resume it through Mesa (its details say so).

## Price and free tier

| | Jev (TypeSafe) | CLEF (Cloudflare, the 27B `clef` model) |
| --- | --- | --- |
| Price | $0.042 per million input tokens; output is free | $0.24 per million input tokens on Workers Paid |
| Free | none | about 1,000 decisions a day on any Cloudflare account (10,000 Neurons, about 450k input tokens of `clef`); resets at 00:00 UTC |
| Past the free tier | | A free account's calls fail until the reset; Workers Paid bills the rest |
| Typical call | 300 to 1,000 input tokens: about $0.02 to $0.03 per 1,000 calls | About $0.07 to $0.11 per 1,000 calls once paid |

Mesa shows each call's cost in the session details' recent use and `mesa decisions status --session <id> --json`.

## What text leaves your Mac

Only to the provider you chose, only for these calls, and each capped at 4,096 characters (about 1,000 tokens):

- **Session state**: the session's agent name and the last 1,400 characters of its screen.
- **Source relevance**: your prompt or the session's saved goal (up to 300 characters), and up to 10 of the project's vault notes, each as its path, title (up to 100 characters) and first 200 characters.
- **Next step**: the session's saved goal (up to 300 characters), and up to 5 recent events, 5 attempts and 8 candidate steps the agent or you supplied, each line up to 300 characters.
- **Completion evidence**: the claim and the evidence the agent or you supplied.

Nothing else: no files, no full transcripts, no keys of other services. The guardrail in front of outside actions never asks a model. Routine calls keep no log of what was sent; a session's file under `~/.mesa/<profile>/sessions/decisions/` keeps only its last uses (site, result, time, cost), never the text. TypeSafe states it does not train on requests ([legal](https://docs.typesafe.ai/legal)); Cloudflare states it does not store or train on Workers AI requests.

## Troubleshooting

The session details (Decision assistance) and `mesa decisions status --session <id>` show each call's result, and for a call that gave no answer, why. The agent always carries on without advice.

| You see | What it means | What to do |
| --- | --- | --- |
| Key rejected (HTTP 401 or 403) | The key is wrong, revoked or expired | Create a new key and Replace it in Settings, or `mesa decisions key set` again |
| Rate limit reached (HTTP 429) | Too many calls at once | Nothing: the next turn asks again |
| Is overloaded (HTTP 529) | The provider is busy | Nothing: the next turn asks again |
| CLEF daily free allocation is used up | The free 10,000 Neurons of the day are spent | Wait for 00:00 UTC, or move to Workers Paid |
| Could not be reached | No network, or the provider is down | Check the connection; nothing else is needed |
| Did not answer within ... ms | A turn's advice was too late (1,500 ms in all), so it was dropped | Nothing: turns never wait longer |
| Not proven for automatic advice yet | The site has not passed the paired workflows | Use it on demand, or turn on Try unproven automatic decisions (Settings > Advanced) |
| Codex sends no advice | Codex runs a new or changed hook only once you review it | In Codex, open the hook review and trust Mesa's hooks (`mesa hooks status` shows UNTRUSTED until then) |
| "Started without mesa-decisions" | The session started before the key | Stop it and resume it through Mesa |
| Antigravity: no global mesa-decisions entry | Its tool is a global entry written only while a model is chosen | `mesa hooks install` |

## Turning it off

- **Everywhere**: Stop using in the model's menu in Settings > Smarter decisions, or `mesa decisions use none`. Keys stay saved; no model is asked.
- **One session**: the switch in its details, or `mesa decisions off --session <id>` (`mesa decisions on` brings it back).
- **Remove a key**: Disconnect in its row's menu, or `mesa decisions key remove typesafe|cloudflare`. Mesa moves to the other model if its key is set, else to None.
