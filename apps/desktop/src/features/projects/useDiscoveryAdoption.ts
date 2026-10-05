import { useRef, useState } from 'react';
import { useCall, useRun } from '@/lib/useCommand';

/**
 * A ticked folder, its conversations as the dialog's scan listed them, and whether one of its
 * running sessions is ticked too.
 */
export type DiscoveryFolder = { path: string; name: string; ids: string[]; live: boolean };

/** Where Add to Mesa is: the folder being added, then the summary once every folder is done. */
export type DiscoveryProgress = {
  total: number;
  done: number;
  current?: { name: string; index: number };
  summary?: {
    registered: number;
    adopted: number;
    /** A conversation's id, or a folder's name when the whole folder failed, with the reason. */
    failed: { label: string; reason: string }[];
  };
};

const DISCOVERY = 'onboarding.discovery';

/**
 * Add to Mesa (CONTEXT.md, First-run discovery): writes `started`, runs `mesa discover adopt` for
 * each folder in order, with the conversation ids the dialog's scan found so none scans again,
 * then writes `complete`. Skip writes `dismissed` and closes, after the folder
 * being added when a run is going.
 */
export function useDiscoveryAdoption(props: { onClose: () => void; onAdded: () => Promise<void> }) {
  const call = useCall();
  const run = useRun();
  const [progress, setProgress] = useState<DiscoveryProgress>();
  const [skipping, setSkipping] = useState(false);
  const skipped = useRef(false);
  const running = useRef(false);
  const write = (value: 'started' | 'complete' | 'dismissed') =>
    run('config.set', { path: DISCOVERY, value });

  const add = async (folders: readonly DiscoveryFolder[]) => {
    if (running.current) return;
    running.current = true;
    if (!(await write('started'))) {
      running.current = false;
      return;
    }
    const total = folders.length;
    const summary: NonNullable<DiscoveryProgress['summary']> = {
      registered: 0,
      adopted: 0,
      failed: [],
    };
    for (const [done, folder] of folders.entries()) {
      if (skipped.current) break;
      setProgress({ total, done, current: { name: folder.name, index: done + 1 } });
      const result = await call('sessions.adoptDiscovered', {
        path: folder.path,
        ids: folder.ids,
        live: folder.live,
      });
      if (!result.ok) {
        summary.failed.push({ label: folder.name, reason: result.error.message });
        continue;
      }
      const { registered, adopted, reopened, failed } = result.data;
      if (registered) summary.registered++;
      summary.adopted += adopted.length + reopened.length;
      summary.failed.push(...failed.map((f) => ({ label: f.agentSessionId, reason: f.reason })));
    }
    running.current = false;
    await props.onAdded();
    if (skipped.current) {
      await write('dismissed');
      props.onClose();
      return;
    }
    await write('complete');
    setProgress({ total, done: total, summary });
  };

  const skip = async () => {
    skipped.current = true;
    setSkipping(true);
    // A run going writes it once its folder is done.
    if (running.current) return;
    await write('dismissed');
    props.onClose();
  };

  return { progress, skipping, add, skip };
}
