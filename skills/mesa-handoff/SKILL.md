---
name: mesa-handoff
description: Hands a Mesa session's work to a fresh successor before its context window fills. Use after each finished step of long work inside a Mesa window, or when asked to hand off.
---

# Mesa handoff

A successor starts with your goal and your note, in your folder and worktree, so the work goes on in a fresh context. Inside a Mesa window, `MESA_SESSION_ID` names your session.

## Steps

1. **Read your context use** after each finished step:

   ```sh
   mesa show $MESA_SESSION_ID --json
   ```

   `data.context.used` is the percent of your context window used. Below the threshold (55, unless your goal names another), keep working. With no `context` there is no reading yet: read it again after your next step.

2. **Reach a stable point** at or over the threshold: finish the step in hand, so tests pass or the change is committed.

3. **Write the note** to a file, such as `/tmp/handoff-$MESA_SESSION_ID.md`, in four sections:

   - **Verified:** each claim with the command you ran and its result.
   - **Assumed:** what you did not verify, said plainly.
   - **Left out on purpose:** what you chose not to do, and why.
   - **Blocked:** what stops the work, and who can unblock it.

   Done when every claim points at its evidence and the successor can go on without asking you.

4. **Hand off:**

   ```sh
   mesa handoff $MESA_SESSION_ID --note /tmp/handoff-$MESA_SESSION_ID.md
   ```

   It starts your successor and stops your session a moment later.

5. **Stop working.** Reply with one line naming the successor's id, and start nothing else: your session is about to end.
