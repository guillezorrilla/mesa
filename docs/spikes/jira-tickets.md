# Jira tickets in a project (#693)

How a Mesa project should follow Jira work, studied before building the Tickets tab, with the Decision model asked at each design fork and the result checked live against a company Jira site.

## What a person follows

Jira's shape is `site > project > board > sprint > issue`. A project is a container: one company project held three team boards in the live check, each with its own sprints. A board is what a team works from, and it is a saved filter, so it can span projects or cut one down to a team. A sprint belongs to a board and lasts about two weeks.

So "the sprint I follow" means the current sprint of a board, which changes every two weeks. Following a fixed sprint goes stale; following a project is too broad. The unit is a Ticket view (CONTEXT.md): a board's current or next sprint, a saved filter, or JQL, each becoming JQL again on every read, with Only mine and Hide done as narrowing toggles.

## Decision model at each fork (CLEF, next-step, on demand)

| Fork | Answer | p | Margin | Outcome |
|---|---|---|---|---|
| Follow a sprint as a board's current sprint, fixed sprint ids, or JQL only | board's current sprint | 0.93 | 0.91 | built |
| Where views live: registry.yaml, own tickets.yaml, config.yaml | tickets.yaml | 0.88 | 0.84 | built |
| A new Tickets tab, or a section of the Context tab | abstained (tab 0.56) | | 0.33 | a tab, as the owner asked |
| Shared boards: views per project, or named in the profile and referenced | named in the profile | 0.94 | 0.91 | built; the agent had leaned per project |
| Ticket prompt: config text, or a Saved prompt by name | Saved prompt | 0.98 | 0.96 | built; the agent had proposed config text |
| Write notes on a ticket start: off, on, or the Context tab's toggle | the shared toggle | 0.93 | 0.90 | built |
| A missing scope for one board read: ask for it, or avoid the call | avoid the call | 0.98 | 0.97 | built |

Each call took under 0.7 s and cost under $0.0001. It agreed with the agent three times and corrected it twice, both times toward one owner (reuse a Saved prompt, define a view once). It abstained on the one fork that was the owner's preference. Findings on when agents ask it are in #692.

## Live check, 2026-10-08

A throwaway profile, connected to the owner's company site through a local broker (`wrangler dev` on port 8787, with `http://localhost:8787/callback/atlassian` added to the Atlassian app's callback URLs), and the CLI built from the branch. Only counts are recorded here, never the site's boards or tickets.

- The consent screen granted the three new scopes. The site has 19 boards, 8 of them kanban.
- `GET /board/<id>` answered 401 "scope does not match": Atlassian's spec asks `read:issue-details:jira` for it. Mesa now reads a board's name from the board list, which the granted scopes allow, and checks the board by reading its sprints.
- A board's active sprints include other boards' sprints whose issues its filter shows: one board answered its own sprint and another team's. Mesa keeps the sprints whose `originBoardId` is the board. The view went from 68 tickets to the board's own 24.
- A kanban board's sprints answer 400 "The board does not support sprints". Adding such a view now says to follow its saved filter or a JQL query.
- Two views of the same board (everyone, and only mine) listed each ticket once.
- An earlier attempt failed with Atlassian's `invalid_request` "Incorrect request parameters" before consent. It succeeded on a retry with no change on Mesa's side, after the owner saved the app's scope changes.
