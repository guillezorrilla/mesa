import type { Recorded, Saved } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { decimal, probabilitiesOf } from '../../input/flags.js';
import { recordedOutput } from '../../output/recorded.js';

// The session writes (CONTEXT.md, Session write): each prints {path, changed, receipt}.

/** What a save prints: where it landed, and whether it changed the note. */
function savedOutput(recorded: Recorded<Saved>) {
  const { path, changed } = recorded.result;
  const text = changed ? `saved ${path}` : `${path} unchanged`;
  return recordedOutput(recorded, { data: { path, changed }, text });
}

const session = {
  type: 'string',
  description:
    'The Mesa session it is from (default: the Mesa window this runs in, on the project)',
} as const;

/** A save's text, given or in a file. */
const textFlags = (what: string) =>
  ({
    text: { type: 'string', description: `The ${what}` },
    file: { type: 'string', description: `A file holding the ${what}` },
  }) as const;

export const vaultSaveDecision = defineCommand({
  name: 'vault save decision',
  summary:
    'Save a decision and its rationale in wiki/decisions/, with one decision receipt; the same save again adds nothing',
  flags: {
    project: { type: 'string', required: true, description: 'The registered project it is for' },
    title: {
      type: 'string',
      required: true,
      description: 'A short name; the note is wiki/decisions/<YYYY-MM-DD>-<its slug>.md',
    },
    decision: { type: 'string', required: true, description: 'What was decided' },
    rationale: { type: 'string', required: true, description: 'Why it was decided' },
    probability: {
      type: 'string',
      multiple: true,
      description:
        "Faro's probability of one option, <option>=<p>, from mesa decide; once per option",
    },
    confidence: { type: 'string', description: "Faro's confidence, from 0 to 1, from mesa decide" },
    session,
  },
  example:
    'mesa vault save decision --project lantern-cove --title "Fixed clock in tide tests" --decision "Tests take the clock as a parameter" --rationale "The flake was the wall clock at midnight" --probability fixed-clock=0.8 --probability retry=0.2 --confidence 0.8',
  run: async ({ mesa, flags }) =>
    savedOutput(
      await mesa.vault.saveDecision({
        project: flags.project,
        session: flags.session,
        title: flags.title,
        decision: flags.decision,
        rationale: flags.rationale,
        ...(flags.probability ? { probabilities: probabilitiesOf(flags.probability) } : {}),
        ...(flags.confidence === undefined
          ? {}
          : { confidence: decimal(flags.confidence, '--confidence') }),
      }),
    ),
});

export const vaultSaveNote = defineCommand({
  name: 'vault save note',
  summary:
    'Save a note in wiki/notes/, or at --path under wiki/ or projects/<project>/, with one vault-change receipt when it changed',
  flags: {
    title: { type: 'string', required: true, description: 'Its title; names wiki/notes/<slug>.md' },
    ...textFlags('note'),
    path: {
      type: 'string',
      description: 'Where it goes instead, under wiki/ or projects/<project>/',
    },
    project: { type: 'string', description: 'The registered project it belongs to' },
    session,
  },
  example:
    'mesa vault save note --project lantern-cove --title "Tide table sources" --file tide-sources.md',
  run: async ({ mesa, flags }) =>
    savedOutput(
      await mesa.vault.saveNote({
        title: flags.title,
        body: flags.text,
        file: flags.file,
        path: flags.path,
        project: flags.project,
        session: flags.session,
      }),
    ),
});

export const vaultSaveSummary = defineCommand({
  name: 'vault save summary',
  summary:
    "Save a session's summary as wiki/sessions/<id>.md, with one vault-change receipt when it changed",
  flags: {
    session: { type: 'string', required: true, description: 'The Mesa session it summarises' },
    ...textFlags('summary'),
  },
  example: 'mesa vault save summary --session a1b2c3d4 --file summary.md',
  run: async ({ mesa, flags }) =>
    savedOutput(
      await mesa.vault.saveSummary({
        session: flags.session,
        summary: flags.text,
        file: flags.file,
      }),
    ),
});
