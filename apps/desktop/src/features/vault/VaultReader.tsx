import type { VaultLink, VaultRead } from '@mesa/core';
import { ExternalLink, EyeOff } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/ui/table';
import { useOptional, useRun } from '@/lib/useCommand';
import { explain, NoteMarkdown } from './NoteMarkdown';
import { useVaultRefresh } from './useVaultLook';

type Select = (path: string) => void;

/** Every broken and ambiguous link, why, and an ambiguous one's candidates to pick from. */
function LinkProblems(props: { links: readonly VaultLink[]; onSelect: Select }) {
  const problems = props.links.filter((link) => link.status !== 'resolved');
  if (!problems.length) return null;
  return (
    <section data-testid="vault-link-problems" aria-label="Unresolved links" className="space-y-1">
      <h4 className="text-sm font-medium">Unresolved links</h4>
      <ul className="space-y-1 text-xs">
        {problems.map((link) => (
          <li
            key={link.start}
            data-status={link.status}
            className="flex flex-wrap items-center gap-1"
          >
            <code className="font-mono">{link.text}</code>
            <span className="text-muted-foreground">
              is {link.status}: {explain(link)}.
            </span>
            {link.status === 'ambiguous' &&
              link.candidates.map((path) => (
                <Button key={path} size="sm" variant="link" onClick={() => props.onSelect(path)}>
                  {path}
                </Button>
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A property's value as text: a list joined, anything not a string as JSON. */
const shown = (value: unknown): string =>
  Array.isArray(value)
    ? value.map(shown).join(', ')
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);

function Properties({ frontmatter }: { frontmatter: Record<string, unknown> }) {
  const entries = Object.entries(frontmatter);
  if (!entries.length) return <Muted size="xs">No properties.</Muted>;
  return (
    <Table data-testid="vault-properties" aria-label="Properties">
      <TableBody>
        {entries.map(([key, value]) => (
          <TableRow key={key}>
            <TableHead
              scope="row"
              className="h-auto w-1/3 py-1.5 font-normal text-muted-foreground"
            >
              {key}
            </TableHead>
            <TableCell className="whitespace-normal break-all py-1.5 font-mono text-xs">
              {shown(value)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OpenInObsidian({ path }: { path: string }) {
  const run = useRun();
  return (
    <Button size="sm" variant="outline" onClick={() => void run('vault.openNote', { note: path })}>
      <ExternalLink aria-hidden /> Open in Obsidian
    </Button>
  );
}

/** Says what Mesa does not show of an item, and opens the exact item in Obsidian. */
function NoPreview({ path, why }: { path: string; why: string }) {
  return (
    <Alert data-testid="vault-no-preview">
      <EyeOff aria-hidden />
      <AlertTitle>Preview not available</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{why}.</p>
        <OpenInObsidian path={path} />
      </AlertDescription>
    </Alert>
  );
}

function Backlinks(props: { paths: readonly string[]; onSelect: Select }) {
  return (
    <section data-testid="vault-backlinks" aria-label="Backlinks" className="space-y-1">
      <h4 className="text-sm font-medium">Backlinks</h4>
      {props.paths.length ? (
        <ul className="space-y-0.5">
          {props.paths.map((path) => (
            <li key={path}>
              <button
                type="button"
                className="break-all text-left font-mono text-xs text-primary underline underline-offset-2 hover:text-primary/80"
                onClick={() => props.onSelect(path)}
              >
                {path}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Muted size="xs">No note links here.</Muted>
      )}
    </section>
  );
}

function Preview({ read, onSelect }: { read: VaultRead; onSelect: Select }) {
  if (read.preview === 'markdown') {
    return (
      <>
        <OpenInObsidian path={read.path} />
        <Properties frontmatter={read.frontmatter} />
        <NoteMarkdown
          body={read.body}
          links={read.links}
          onSelect={onSelect}
          testId="vault-markdown"
        />
        <LinkProblems links={read.links} onSelect={onSelect} />
      </>
    );
  }
  if (read.preview === 'canvas') {
    return (
      <>
        <NoPreview path={read.path} why="Mesa shows a canvas's text, not its layout" />
        <p data-testid="vault-canvas" className="text-sm">
          {read.nodes} {read.nodes === 1 ? 'node' : 'nodes'}, {read.edges}{' '}
          {read.edges === 1 ? 'edge' : 'edges'}
        </p>
        <ul className="space-y-2">
          {read.texts.map((text, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Text nodes are immutable text with no child state.
            <li key={i} className="whitespace-pre-wrap rounded-md border p-2 text-xs">
              {text}
            </li>
          ))}
        </ul>
      </>
    );
  }
  if (read.preview === 'base') {
    return (
      <>
        <NoPreview path={read.path} why="Mesa shows a base's YAML, not its views" />
        {read.views && (
          <p data-testid="vault-base-views" className="text-sm">
            Views: {read.views.join(', ')}
          </p>
        )}
        <pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{read.yaml}</pre>
      </>
    );
  }
  return <NoPreview path={read.path} why={read.reason} />;
}

/**
 * The selected item as `mesa vault read` shows it: a note's properties, Markdown, and links, or
 * what Mesa shows of any other kind, then its backlinks. A link or backlink selects its item.
 * Each new look at the vault (`looks`, the screen's count) reads it again unless a read still
 * runs, so an edit made outside Mesa shows in place.
 */
export function VaultReader(props: { path: string; looks: number; onSelect: Select }) {
  const { path, looks, onSelect } = props;
  const { data: read, error, busy, refresh } = useOptional('vault.read', { path });
  useVaultRefresh(looks, busy, refresh);
  if (error?.code === 'not_found') return <Muted role="status">Nothing at {path} yet.</Muted>;
  if (error)
    return (
      <Muted role="status">
        {path} could not be read: {error.message}.
      </Muted>
    );
  if (!read) return <Muted>Reading {path}...</Muted>;
  return (
    <div data-testid="vault-reader" className="min-w-0 space-y-4">
      <Preview read={read} onSelect={onSelect} />
      <Backlinks paths={read.backlinks} onSelect={onSelect} />
    </div>
  );
}
