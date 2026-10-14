import type { ViewQuery } from '@mesa/core';
import { useState } from 'react';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { freeName } from './freeName';

/**
 * What every tracker's Follow dialog does with the view its picker builds (`query`, undefined
 * until complete): Only mine (off at first, so every ticket shows) and Hide done (on at first) on
 * top of it, its name (`typed`, else `base` made free among the profile's views), and Follow,
 * which adds the view and follows it in `project` (or follows view `existing` as it is), then
 * `onFollowed`. `toggles` are the frame's toggle props.
 */
export function useFollowView(
  project: string,
  onFollowed: () => void,
  query: ViewQuery | undefined,
  base: string,
  typed = '',
) {
  const run = useRun();
  const { acting, act } = useAct();
  const views = useCommand('tickets.views');
  const [mine, setMine] = useState(false);
  const [hideDone, setHideDone] = useState(true);
  const view = query && {
    ...query,
    ...(mine ? {} : { everyone: true }),
    ...(hideDone ? {} : { showDone: true }),
  };
  const suggested = freeName(
    base,
    (views.data ?? []).map((v) => v.name),
  );
  const name = typed.trim() || suggested;
  const follow = (existing?: string) =>
    void act(async () => {
      const target =
        existing ?? (view && (await run('tickets.viewsAdd', { view: { ...view, name } }))?.name);
      if (target && (await run('tickets.follow', { project, view: target }))) onFollowed();
      return undefined;
    });
  return {
    /** The profile's views, once read. */
    views: views.data,
    view,
    name,
    suggested,
    acting,
    follow,
    toggles: { mine, hideDone, onMine: setMine, onHideDone: setHideDone },
  };
}
