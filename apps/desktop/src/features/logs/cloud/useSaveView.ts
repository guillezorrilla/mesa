import type { CloudFilters } from '@/lib/client/logs';
import { useCommand, useRun } from '@/lib/useCommand';

/**
 * Saves `filters` as view `name` among logs.views (one of the same name is replaced), leaving
 * out what belongs to the moment: the time range, a trace and the noise switch.
 */
export function useSaveView() {
  const config = useCommand('config.get');
  const run = useRun();
  return async (name: string, filters: CloudFilters) => {
    const views = config.data?.logs.views ?? [];
    const { since: _, trace: __, all: ___, ...kept } = filters;
    await run('config.set', {
      path: 'logs.views',
      value: [...views.filter((v) => v.name !== name), { name, ...kept }],
    });
    await config.refresh();
  };
}
