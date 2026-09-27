import type { profileService } from '../profile/service.js';
import { type GridGroup, removeGridGroup, saveGridGroup } from './grid-groups.js';

/** Named terminal tile sets live in profile config, beside the Board preferences. */
export function gridService(
  read: () => GridGroup[],
  set: ReturnType<typeof profileService>['config']['set'],
) {
  const write = (groups: GridGroup[]) => {
    const recorded = set('grid.groups', JSON.stringify(groups));
    return { ...recorded, result: { groups } };
  };
  return {
    list: read,
    save: (group: GridGroup) => write(saveGridGroup(read(), group)),
    remove: (name: string) => write(removeGridGroup(read(), name)),
  };
}
