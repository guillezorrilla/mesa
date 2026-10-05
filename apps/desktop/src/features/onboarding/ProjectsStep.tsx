import { FolderPlus } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { ChoiceRow } from './ChoiceRow';

/** How many of the folders used most are ticked to start with. */
const TICKED = 3;

const counted = (n: number) => `${n} ${n === 1 ? 'conversation' : 'conversations'}`;

/**
 * The projects Mesa starts with (CONTEXT.md, First-run discovery): the folders Claude Code or
 * Codex ran in, most conversations first and the top three ticked, plus any folder picked.
 * Continue registers the ticked ones and completes discovery, so its dialog never opens on its own.
 */
export function ProjectsStep(props: {
  /** Projects already registered: with one, Continue needs nothing ticked. */
  registered: number;
  onRegistered: () => Promise<void>;
  onNext: () => void;
}) {
  const found = useCommand('sessions.discover');
  const { pickFolder } = usePlatform();
  const run = useRun();
  const { acting, act } = useAct();
  const [picked, setPicked] = useState<string[]>([]);
  const [ticks, setTicks] = useState<Set<string>>();
  const folders = [
    ...(found.data?.projects ?? [])
      .filter((p) => !p.registered && !p.error)
      .sort((a, b) => b.conversations - a.conversations)
      .map((p) => ({ path: p.path, title: p.name, detail: counted(p.conversations) })),
    ...picked.map((path) => ({ path, title: path.split('/').at(-1) ?? path, detail: path })),
  ];
  const ticked = ticks ?? new Set(folders.slice(0, TICKED).map((f) => f.path));
  const tick = (path: string, on: boolean) => {
    const next = new Set(ticked);
    if (on) next.add(path);
    else next.delete(path);
    setTicks(next);
  };
  const add = () =>
    act(async () => {
      for (const path of folders.filter((f) => ticked.has(f.path)).map((f) => f.path))
        if (!(await run('projects.register', { path }))) return undefined;
      await run('config.set', { path: 'onboarding.discovery', value: 'complete' });
      await props.onRegistered();
      props.onNext();
      return undefined;
    });
  return (
    <div className="space-y-4">
      <Muted>
        {found.data && folders.length === 0
          ? 'Pick a folder with a Git repository to start with.'
          : 'Folders where you already use Claude Code or Codex. Pick the ones Mesa should show.'}
      </Muted>
      {found.busy && !found.data && <Muted>Looking for your projects...</Muted>}
      <div className="space-y-2">
        {folders.map((folder) => (
          <ChoiceRow
            key={folder.path}
            testId="project-choice"
            type="checkbox"
            name="project"
            checked={ticked.has(folder.path)}
            onChange={(on) => tick(folder.path, on)}
            title={folder.title}
            detail={folder.detail}
          />
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={acting}
        onClick={() =>
          void act(async () => {
            const folder = await pickFolder();
            if (folder && !folders.some((f) => f.path === folder)) {
              setPicked((current) => [...current, folder]);
              tick(folder, true);
            }
            return undefined;
          })
        }
      >
        <FolderPlus aria-hidden /> Add another folder...
      </Button>
      <div className="flex justify-end">
        <Button
          data-testid="onboarding-continue"
          disabled={acting || (ticked.size === 0 && props.registered === 0)}
          onClick={() => void add()}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
