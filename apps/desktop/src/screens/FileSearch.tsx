import type { FileSearch as Found } from '@mesa/core';
import { Search } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { moveListFocus } from '@/lib/listKeys';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/** The Search pane: file names or contents through `files.search`, each hit opening at its line. */
export function FileSearch(props: {
  project: string;
  checkout?: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onOpen: (target: { path: string; line: number }) => void;
}) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'name' | 'content'>('name');
  const [found, setFound] = useState<Found>();
  const run = useRun();
  const { acting, act } = useAct();
  const search = () =>
    act(async () => {
      const result = await run('files.search', {
        project: props.project,
        checkout: props.checkout,
        query,
        content: mode === 'content',
      });
      if (result) setFound(result);
    });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        className="shrink-0 space-y-2 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <div className="flex gap-1">
          <Input
            ref={props.inputRef}
            aria-label="Search files"
            className="h-8 border-0 bg-background text-sm dark:bg-background"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search in files..."
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            aria-label="Run file search"
            disabled={!query.trim() || acting}
          >
            <Search aria-hidden />
          </Button>
        </div>
        <NativeSelect
          aria-label="File search mode"
          className="h-8"
          value={mode}
          onChange={(event) => setMode(event.target.value as 'name' | 'content')}
        >
          <NativeSelectOption value="name">Filenames</NativeSelectOption>
          <NativeSelectOption value="content">Contents</NativeSelectOption>
        </NativeSelect>
      </form>
      {found && (
        <section
          className="min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-2"
          aria-label="File search results"
        >
          <p className="px-2 text-xs text-muted-foreground">
            {found.hits.length} {found.hits.length === 1 ? 'match' : 'matches'}
          </p>
          {found.hits.map((hit) => (
            <button
              key={`${hit.path}:${hit.line}`}
              data-file-row
              type="button"
              onKeyDown={moveListFocus}
              className="block w-full rounded-md px-2 py-1 text-left text-xs hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => props.onOpen({ path: hit.path, line: hit.line })}
            >
              <span className="font-mono">
                {hit.path}:{hit.line}
              </span>
              <span className="block truncate text-muted-foreground">{hit.preview}</span>
            </button>
          ))}
          {found.truncated && (
            <p className="px-2 text-xs text-muted-foreground">
              Showing the first 100 matches or 1,500 entries.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
