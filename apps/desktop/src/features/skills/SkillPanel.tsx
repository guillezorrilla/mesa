import type { Config, SkillInventoryRow, WorkspaceFile } from '@mesa/core';
import { ArrowLeft, Eye, Pencil, Save } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { MarkdownView } from '@/components/MarkdownView';
import { Muted } from '@/components/Muted';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { FileEditor } from '@/features/files/FileEditor';
import { useUnloadGuard } from '@/features/files/useUnloadGuard';
import { PROSE } from '@/features/vault/VaultReader';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { SkillChips, SkillMark } from './SkillCard';

/** A Markdown file as it reads: the body, without the frontmatter the header already shows. */
const body = (text: string) => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

/**
 * One skill's page: its name, description and chips, its files, and the open file rendered;
 * a writable skill's file opens in the editor and saves only over the revision it read.
 */
export function SkillPanel(props: {
  project: string;
  row: SkillInventoryRow;
  editor: Config['editor'];
  /** The Mesa skill's enable buttons, beside Edit. */
  actions?: ReactNode;
  /** Why the skill is on, off or read-only. */
  notes?: ReactNode;
  onBack: () => void;
  onSaved: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { row } = props;
  const run = useRun();
  const { acting, act } = useAct();
  const [file, setFile] = useState('SKILL.md');
  const [opened, setOpened] = useState<WorkspaceFile>();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const dirty = Boolean(opened && opened.text !== draft);
  useEffect(() => props.onDirtyChange(dirty), [dirty, props.onDirtyChange]);
  useUnloadGuard(dirty);
  const open = async (name: string) => {
    const document = await run('skills.read', { id: row.id, project: props.project, file: name });
    if (!document) return;
    setFile(name);
    setOpened(document);
    setDraft(document.text);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: Each skill page opens its SKILL.md once.
  useEffect(() => void open('SKILL.md'), [row.id]);
  const save = () =>
    act(async () => {
      if (!opened || !row.writable) return undefined;
      const result = await run('skills.write', {
        id: row.id,
        project: props.project,
        file,
        text: draft,
        revision: opened.revision,
      });
      if (!result) return undefined;
      setOpened({ ...opened, text: draft, revision: result.revision ?? opened.revision });
      await props.onSaved();
      return said(`Saved ${row.name}/${file}`, result);
    });
  const files = ['SKILL.md', ...row.supportFiles];
  const markdown = /\.md(?:own)?$/i.test(file);
  return (
    <section aria-label="Skill details" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          disabled={dirty}
          title={dirty ? 'Save or discard your changes first' : undefined}
          onClick={props.onBack}
        >
          <ArrowLeft aria-hidden /> Back to skills
        </Button>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {props.actions}
          {editing && dirty && (
            <Button size="sm" variant="ghost" onClick={() => opened && setDraft(opened.text)}>
              Discard
            </Button>
          )}
          {row.writable &&
            (editing ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                  <Eye aria-hidden /> Preview
                </Button>
                <Button size="sm" disabled={acting || !dirty} onClick={() => void save()}>
                  <Save aria-hidden /> Save
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={!opened}
                onClick={() => setEditing(true)}
              >
                <Pencil aria-hidden /> {dirty ? 'Edit (unsaved)' : 'Edit'}
              </Button>
            ))}
        </span>
      </div>
      <div className="flex min-h-[30rem] overflow-hidden rounded-lg border bg-card/40">
        {files.length > 1 && (
          <nav aria-label="Skill files" className="w-56 shrink-0 space-y-0.5 border-r bg-card p-2">
            {files.map((name) => (
              <button
                key={name}
                type="button"
                aria-current={name === file || undefined}
                disabled={dirty}
                className={cn(
                  'block w-full truncate rounded-md px-2.5 py-1.5 text-left font-mono text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-50',
                  name === file && 'bg-accent text-foreground hover:bg-accent',
                )}
                onClick={() => void open(name)}
              >
                {name}
              </button>
            ))}
          </nav>
        )}
        <div className="min-w-0 flex-1 space-y-4 p-6">
          <header className="flex gap-3">
            <SkillMark />
            <div className="min-w-0 space-y-1">
              <h3 className="text-lg font-semibold">{row.name}</h3>
              {row.description && (
                <p className="text-sm text-muted-foreground">{row.description}</p>
              )}
            </div>
          </header>
          <SkillChips row={row} />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="break-all font-mono">{row.path}</p>
            {row.readOnlyReason && <p>Read-only: {row.readOnlyReason}.</p>}
            {props.notes}
          </div>
          <div className="border-t pt-5">
            {!opened ? (
              <Muted>Reading {file}...</Muted>
            ) : editing ? (
              <FileEditor
                key={`${row.id}/${file}`}
                path={file}
                value={draft}
                initialText={opened.text}
                onChange={setDraft}
                preferences={props.editor}
                previewToggle={false}
              />
            ) : markdown ? (
              <div className={PROSE}>
                <MarkdownView text={file === 'SKILL.md' ? body(draft) : draft} />
              </div>
            ) : (
              <pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{draft}</pre>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
