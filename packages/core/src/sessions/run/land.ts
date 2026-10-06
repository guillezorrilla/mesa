import { redactWhole } from '../../lib/redact.js';
import { toFail } from '../../lib/result.js';
import { findProject } from '../../projects/projects.js';
import { joinWarnings } from '../../receipts/recorder.js';
import { landingOf, landOutput } from '../../skills/landing.js';
import { recordAgent, type SessionRecord } from '../record/record.js';
import { markRunEnded } from '../record/session-receipt.js';
import type { EndContext, RunEnd } from './end.js';
import { type HeadlessResult, runOutput } from './files.js';
import { skillOfRun } from './start.js';

/**
 * What a run's end records, best effort: its output, when ok and redacted, as the vault note its
 * skill's output becomes (landOutput), with a receipt only for a changed note. A historical
 * opening receipt, when present, is finished by markRunEnded. Failures become warnings.
 */
export async function finishRun(ctx: EndContext, run: SessionRecord, read: HeadlessResult) {
  const skill = skillOfRun(run);
  let note: string | undefined;
  let receipt: RunEnd['receipt'];
  let unlanded: string | undefined;
  const landed = {
    run: run.id,
    project: run.project,
    agent: recordAgent(run),
    about: run.about,
    endedAt: run.endedAt ?? run.startedAt,
  };
  if (read.ok && skill && landingOf(skill, landed)) {
    try {
      const notes = ctx.notes();
      const output = redactWhole(read.output, ctx.home, ctx.secrets());
      const landedNote = await landOutput(
        { ...notes, record: ctx.record },
        skill,
        skill === 'project-brief'
          ? { ...landed, repo: findProject(ctx.open(), run.project).path }
          : landed,
        output,
      );
      note = landedNote?.path;
      receipt = landedNote?.receipt;
      unlanded = landedNote?.warning;
    } catch (error) {
      unlanded = `run ${run.id}'s output not written to the vault: ${toFail(error).error.message}`;
    }
  }
  const result = note ? { ...read, note } : read;
  const unfinished = await markRunEnded(ctx, run, result, runOutput(ctx.paths.runs, run.id));
  const warning = joinWarnings(unlanded, unfinished);
  return { result, ...(receipt ? { receipt } : {}), ...(warning ? { warning } : {}) };
}
