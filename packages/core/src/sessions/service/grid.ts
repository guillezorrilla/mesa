import type { MesaContext } from '../../context.js';
import type { profileService } from '../../profile/service.js';
import { type GridGroup, removeGridGroup, saveGridGroup } from '../grid-groups.js';

/** The profile service's config.set: the grid's groups are a config value. */
export type SetConfig = ReturnType<typeof profileService>['config']['set'];

/** The app grid's named groups of sessions, kept as the profile's config value `grid.groups`. */
export function gridActions(ctx: MesaContext, setConfig: SetConfig) {
  const { open } = ctx;
  return {
    list: () => open().config.grid.groups,
    save: (group: GridGroup) => {
      const groups = saveGridGroup(open().config.grid.groups, group);
      const recorded = setConfig('grid.groups', JSON.stringify(groups));
      return { ...recorded, result: { groups } };
    },
    remove: (name: string) => {
      const groups = removeGridGroup(open().config.grid.groups, name);
      const recorded = setConfig('grid.groups', JSON.stringify(groups));
      return { ...recorded, result: { groups } };
    },
  };
}
