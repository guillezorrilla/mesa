import { MesaError } from '../lib/result.js';

export type GridGroup = { name: string; project?: string; sessions: string[] };

/** Saves the visible tile ids under one profile-local name; the same name updates that group. */
export function saveGridGroup(groups: readonly GridGroup[], input: GridGroup): GridGroup[] {
  const name = input.name.trim();
  if (!name || name.length > 60)
    throw new MesaError('usage', 'grid group name must be 1 to 60 characters');
  if (input.sessions.length === 0) throw new MesaError('usage', 'grid group needs a session');
  const group = { ...input, name, sessions: [...new Set(input.sessions)] };
  const previous = groups.findIndex((item) => item.name.toLowerCase() === name.toLowerCase());
  return previous < 0
    ? [...groups, group]
    : groups.map((item, index) => (index === previous ? group : item));
}

export function removeGridGroup(groups: readonly GridGroup[], name: string): GridGroup[] {
  const next = groups.filter((group) => group.name !== name);
  if (next.length === groups.length) throw new MesaError('not_found', `no grid group ${name}`);
  return next;
}
