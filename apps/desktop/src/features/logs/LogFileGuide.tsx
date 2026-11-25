import { sourceId } from '@mesa/core/browser';
import { FileText, FolderOpen, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CutStartText } from '@/components/CutStartText';
import { Muted } from '@/components/Muted';
import { SectionLabel } from '@/components/SectionLabel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePlatform } from '@/lib/MesaRoot';
import { useCall } from '@/lib/useCommand';

/**
 * A log file the project's server writes anywhere on disk (Rails' log/development.log, Laravel's
 * storage/logs/laravel.log): the gitignored `*.log` files Mesa finds in the checkout, one to add,
 * or a path typed or picked. Adding keeps it in this profile, never in the repository, and hands
 * its source back.
 */
export function LogFileGuide(props: { project: string; onFound: (source: string) => void }) {
  const call = useCall();
  const { pickFile } = usePlatform();
  const [listed, setListed] = useState<{ files: string[]; suggested: string[] }>();
  const [path, setPath] = useState('');
  const [error, setError] = useState<string>();
  useEffect(() => {
    void call('logs.files', { project: props.project }).then((found) =>
      setListed(found.ok ? found.data : { files: [], suggested: [] }),
    );
  }, [call, props.project]);
  const add = async (file: string) => {
    const kept = await call('logs.addFile', { path: file.trim(), project: props.project });
    if (!kept.ok) return setError(kept.error.message);
    props.onFound(sourceId('file', kept.data.files.at(-1) ?? file.trim()));
  };
  const remove = async (file: string) => {
    const kept = await call('logs.removeFile', { path: file, project: props.project });
    if (!kept.ok) return setError(kept.error.message);
    setListed((now) => now && { ...now, files: kept.data.files });
  };
  const suggested = listed?.suggested;
  return (
    <div className="grid min-w-0 gap-4 text-sm">
      <Muted>
        Mesa reads it as it grows and keeps it in this profile, never in the repository.
      </Muted>
      <section className="grid gap-1.5" aria-label="Suggested log files">
        <SectionLabel>In this project, ignored by git</SectionLabel>
        {!suggested ? (
          <Muted>Looking</Muted>
        ) : suggested.length ? (
          suggested.map((file) => (
            <div
              key={file}
              className="flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1"
            >
              <FileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <CutStartText text={file} />
              <Button size="sm" variant="ghost" onClick={() => void add(file)}>
                <Plus aria-hidden /> Add
              </Button>
            </div>
          ))
        ) : (
          <Muted>No *.log files the checkout ignores.</Muted>
        )}
      </section>
      {listed?.files.length ? (
        <section className="grid gap-1.5" aria-label="Kept log files">
          <SectionLabel>Read for this project</SectionLabel>
          {listed.files.map((file) => (
            <div
              key={file}
              className="flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1"
            >
              <FileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <CutStartText text={file} />
              <Button size="sm" variant="ghost" onClick={() => void remove(file)}>
                <X aria-hidden /> Remove
              </Button>
            </div>
          ))}
        </section>
      ) : null}
      <section className="grid gap-1.5" aria-label="Another log file">
        <SectionLabel>Anywhere on disk</SectionLabel>
        <div className="flex gap-2">
          <Input
            aria-label="Log file path"
            placeholder="/path/to/server.log"
            value={path}
            onChange={(event) => setPath(event.currentTarget.value)}
            onKeyDown={(event) => event.key === 'Enter' && path.trim() && void add(path)}
          />
          <Button
            variant="outline"
            onClick={() => void pickFile().then((picked) => picked && setPath(picked))}
          >
            <FolderOpen aria-hidden /> Choose
          </Button>
          <Button disabled={!path.trim()} onClick={() => void add(path)}>
            Add
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-state-failed">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
