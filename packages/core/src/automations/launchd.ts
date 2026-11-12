import type { MesaContext } from '../context.js';
import { launchAgent } from '../lib/launch-agent.js';

/** The profile's scheduler: `automations tick` every 30 seconds and at load (ADR-0016). */
export const automationLaunchd = (
  ctx: Pick<MesaContext, 'env' | 'home' | 'paths' | 'profile' | 'run' | 'self'>,
) =>
  launchAgent(ctx, {
    name: 'automations',
    what: 'scheduler',
    command: ['automations', 'tick'],
    run: { every: 30 },
    log: 'automation',
  });
