import type { Facet } from '@mesa/core/browser';
import { Play, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { fieldClause } from './explorerQuery';

/** The last word being typed in `query` (what a suggestion completes). */
const lastWord = (query: string) => /[^\s()]*$/.exec(query)?.[0] ?? '';

/** Suggestions for `word`: `jsonPayload.<key>` while naming a field, its values after the `=`. */
function suggestionsFor(word: string, facets: readonly Facet[]) {
  if (word.length < 2) return [];
  const eq = /^jsonPayload\.([\w.-]+)=(.*)$/.exec(word);
  if (eq) {
    const values = facets.find((f) => f.key === eq[1])?.values ?? [];
    return values
      .map((v) => fieldClause(eq[1] ?? '', v.value))
      .filter((s) => s.startsWith(word))
      .slice(0, 8);
  }
  const typed = word.replace(/^jsonPayload\./, '').toLowerCase();
  return facets
    .filter((f) => f.key.toLowerCase().startsWith(typed))
    .map((f) => `jsonPayload.${f.key}=`)
    .slice(0, 8);
}

/**
 * The Explorer's query (CONTEXT.md, Cloud Logs) in the Logging query language, with field and value
 * suggestions from the entries read; Run (Cmd+Enter, "/" to focus), and Ask in words, which turns a
 * sentence into a query through the agent and puts it in the bar, highlighted (`written`), for the
 * person to read and Run.
 */
export function QueryBar(props: {
  query: string;
  facets: readonly Facet[];
  busy: boolean;
  written?: boolean;
  onChange: (query: string) => void;
  onRun: (query: string) => void;
  onWords: (sentence: string) => Promise<void>;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [words, setWords] = useState('');
  const [asking, setAsking] = useState(false);
  const suggestions = suggestionsFor(lastWord(props.query), props.facets);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== '/' || target?.closest('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
      box.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const complete = (suggestion: string) => {
    const word = lastWord(props.query);
    props.onChange(props.query.slice(0, props.query.length - word.length) + suggestion);
    box.current?.focus();
  };
  return (
    <div className="grid gap-2">
      <div className="relative">
        <Textarea
          ref={box}
          aria-label="Query"
          spellCheck={false}
          placeholder='severity>=ERROR AND jsonPayload.company="Lantern Cove"'
          className={cn(
            'min-h-16 resize-y pr-28 font-mono text-[12px] leading-5',
            props.written && 'ring-2 ring-state-working/60',
          )}
          value={props.query}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              props.onRun(props.query);
            }
          }}
        />
        <Button
          size="sm"
          title="Run (Cmd+Enter)"
          className="absolute right-2 bottom-2 h-7"
          disabled={props.busy}
          onClick={() => props.onRun(props.query)}
        >
          <Play aria-hidden /> Run
        </Button>
      </div>
      {props.written && (
        <p className="text-[11px] text-state-working">
          Written from your words: read it, then Run to read the entries.
        </p>
      )}
      {suggestions.length > 0 && (
        <ul aria-label="Suggestions" className="flex flex-wrap gap-1">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                className="rounded border bg-card px-1.5 font-mono text-[11px] hover:bg-accent"
                onClick={() => complete(suggestion)}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!words.trim()) return;
          setAsking(true);
          await props.onWords(words.trim());
          setAsking(false);
        }}
      >
        <Sparkles aria-hidden className="size-3.5 shrink-0 text-state-working" />
        <Input
          aria-label="Ask in words"
          placeholder="Ask in words: checkout errors for Lantern Cove since the deploy"
          className="h-8 text-xs"
          value={words}
          onChange={(event) => setWords(event.currentTarget.value)}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={asking || !words.trim()}
        >
          {asking ? 'Writing the query' : 'Write query'}
        </Button>
      </form>
    </div>
  );
}
