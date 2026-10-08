// What Mesa says about hooks it installed once that are now out of date (#678). Pure, so the app
// bundles it through `@mesa/core/browser` too.

/** Doctor's hint for those hooks, which the inbox tells from a never-installed one. */
export const HOOKS_UPDATE_HINT = 'needs an update: run `mesa hooks install`';

/** The one line on what an update fixes, wherever Mesa offers it. */
export const HOOKS_UPDATE_DETAIL =
  "Your coding agents run Mesa's older hooks, so sessions can miss its tracking and advice.";

/** What Mesa says once after an update that changed Codex's hook commands. */
export const CODEX_REVIEW_TITLE = "Codex needs you to approve Mesa's updated hooks";
