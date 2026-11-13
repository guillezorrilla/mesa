import { createHash } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { MesaContext } from '../../context.js';
import type { Faro } from '../../decisions/faro.js';
import { writeFileAtomic } from '../../lib/atomic-file.js';
import { typeable } from '../../lib/untrusted-text.js';
import type { promptsService } from '../../prompts/prompts.js';
import { projectScope } from '../../sessions/record/general.js';
import type { sessionsService } from '../../sessions/service/index.js';
import type { SessionSteer } from './answer-steer.js';

type Sessions = ReturnType<typeof sessionsService>['sessions'];

/**
 * The phone's steering, each through the core function its `mesa` command uses, as a person:
 * a send names the phone in its receipt (`via: phone`), a photo is kept in the profile's
 * `phone-images/` for the agent to read, and a handoff's note is written for core to copy.
 */
export function sessionSteer(
  ctx: MesaContext,
  faro: Pick<Faro, 'guardrail'>,
  sessions: Sessions,
  prompts: ReturnType<typeof promptsService>['list'],
): SessionSteer {
  const send = (id: string, text: string, yes: boolean) =>
    sessions.send(id, text, { noFrom: true, yes, via: 'phone' });
  return {
    send,
    type: (id, text, yes) => sessions.terminal.type(id, text, { yes, via: 'phone' }),
    check: (id, text) =>
      faro.guardrail.check(typeable(text), projectScope(ctx.store.get(id).project)),
    // ponytail: photos stay in phone-images/ for the agent to read later, a refused one too;
    // prune them by age if the folder grows.
    image: (id, jpeg, note) => {
      const dir = join(ctx.paths.root, 'phone-images');
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const revision = createHash('sha256').update(jpeg).digest('hex');
      const path = join(dir, `${revision.slice(0, 16)}.jpg`);
      writeFileAtomic(path, jpeg, 0o600);
      return sessions.images.prompt(id, path, revision, ctx.profile, note);
    },
    act: async (id, action, text = '') => {
      switch (action) {
        case 'stop':
          await sessions.stop(id);
          return undefined;
        case 'resume':
          return (await sessions.resume(id)).result.record.id;
        case 'fork':
          return (await sessions.fork(id)).result.id;
        case 'handoff': {
          const note = join(ctx.paths.handoffs, `phone-${ctx.newId()}.md`);
          mkdirSync(ctx.paths.handoffs, { recursive: true });
          writeFileAtomic(note, text);
          try {
            return (await sessions.handoff(id, { note })).result.to.id;
          } finally {
            rmSync(note, { force: true });
          }
        }
        case 'rename':
          sessions.rename(id, text);
          return undefined;
        case 'archive':
          await sessions.archive(id);
          return undefined;
        case 'unarchive':
          await sessions.unarchive(id);
          return undefined;
      }
    },
    prompts,
  };
}
