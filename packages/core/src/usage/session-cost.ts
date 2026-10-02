import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { claudeTranscripts } from '../agents/claude/paths.js';
import { transcriptFile } from '../agents/claude/transcripts.js';
import type { MesaContext } from '../context.js';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { scanLines } from '../lib/file-lines.js';
import { claudeReading, claudeUsageFiles } from './claude.js';
import { sessionNativeIds, sessionWindow } from './sources.js';
import { HookStampSchema } from './store.js';

/** What a session's tally has read: up to where in each file, and each charge's time and cost. */
const TallySchema = z.strictObject({
  hook: HookStampSchema,
  /** Each native session id's transcript. */
  transcripts: z.record(z.string(), z.string()),
  /** Each transcript or subagent file's offset after its last complete line. */
  offsets: z.record(z.string(), z.number().int().nonnegative()),
  /** Each charge by its usage row id, the last update of a repeated message winning. */
  readings: z.record(z.string(), z.strictObject({ at: z.string(), cost: z.number().nullable() })),
});
type Tally = z.infer<typeof TallySchema>;

const fresh = (): Tally => ({
  hook: { offset: 0, nativeIds: [], changedIds: [] },
  transcripts: {},
  offsets: {},
  readings: {},
});

function readTally(file: string): Tally {
  try {
    return TallySchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    // None yet, or one that does not read: count again from the start.
    return fresh();
  }
}

/**
 * A Claude session's estimated cost so far, for its status line, which Claude runs after every
 * reply. Each call reads only the lines its transcripts gained since the last, kept in the
 * session's own tally (`sessions/costs/<id>.json`), and never reads or writes the usage ledger,
 * which `mesa usage` keeps. It counts as the ledger does: the same readings, prices, native ids,
 * and session window. Null when unknown: no Claude session, no transcript yet, a native identity
 * Mesa lost, or a reading without a price.
 */
export function sessionCost(ctx: MesaContext, id: string): number | null {
  const record = ctx.store.find(id);
  if (record?.agent !== 'claude') return null;
  const file = join(ctx.paths.costs, `${id}.json`);
  const tally = readTally(file);
  const before = JSON.stringify(tally);
  const { nativeIds, hook, lost } = sessionNativeIds(
    ctx,
    record,
    tally.hook,
    Object.keys(tally.transcripts),
  );
  tally.hook = hook;
  let missing = lost || nativeIds.size === 0;
  for (const nativeId of nativeIds) {
    const known = tally.transcripts[nativeId];
    const transcript =
      known && existsSync(known)
        ? known
        : transcriptFile(claudeTranscripts(ctx.deps.home), nativeId);
    if (!transcript) {
      missing = true;
      continue;
    }
    tally.transcripts[nativeId] = transcript;
    const sources = claudeUsageFiles(transcript);
    // A file that shrank was rewritten (a rewind): its native session is counted again.
    if (sources.some((source) => (tally.offsets[source] ?? 0) > statSync(source).size)) {
      for (const source of sources) delete tally.offsets[source];
      for (const key of Object.keys(tally.readings))
        if (key.startsWith(`claude:${nativeId}:`)) delete tally.readings[key];
    }
    for (const source of sources) {
      tally.offsets[source] = scanLines(source, tally.offsets[source] ?? 0, (line) => {
        const reading = claudeReading(line, id, nativeId);
        if (reading)
          tally.readings[reading.id] = { at: reading.at, cost: reading.estimatedCostUsd };
      });
    }
  }
  if (JSON.stringify(tally) !== before) {
    mkdirSync(ctx.paths.costs, { recursive: true, mode: 0o700 });
    writeFileAtomic(file, `${JSON.stringify(tally)}\n`, 0o600);
  }
  if (missing) return null;
  const within = sessionWindow(ctx, record);
  let total = 0;
  for (const reading of Object.values(tally.readings)) {
    if (!within(reading.at)) continue;
    if (reading.cost === null) return null;
    total += reading.cost;
  }
  return total;
}
