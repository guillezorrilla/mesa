import type { VaultLink } from '@mesa/core';
import { CircleHelp, Link2Off, Paperclip } from 'lucide-react';
import type { ReactNode } from 'react';
import { MarkdownView } from '@/components/MarkdownView';

type Select = (path: string) => void;

/** How a vault note's Markdown reads: the reader's and the project overview's. */
export const PROSE =
  'min-w-0 space-y-3 break-words text-sm leading-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:font-mono [&_code]:text-xs [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-5';

// Each link core found is written back into the body as a Markdown link to `#vault-link-<i>`,
// its index in `links`, and that href renders as the link.
const LINK = '#vault-link-';

/** Backslash-escapes Markdown punctuation, so a label shows as written. */
const plain = (text: string) => text.replace(/[!-/:-@[-`{-~]/g, '\\$&');

/** The words a link shows: its alias, else what it names and its subpath, as Obsidian does. */
const label = (link: VaultLink) =>
  (!link.embed && link.alias) || [link.target, link.subpath].filter(Boolean).join(' > ');

/** A bare link's title written after it on its line, as `[[path]]: Title` (the hub's lists). */
const TITLED = /^: ([^\n]+)/;

/**
 * The body with every link rewritten as `[label](#vault-link-<i>)`, where core found it. A bare
 * link followed by `: Title` shows as its title alone.
 */
function linkedBody(body: string, links: readonly VaultLink[]) {
  let at = 0;
  let out = '';
  for (const [i, link] of links.entries()) {
    const titled = !link.alias && !link.embed && TITLED.exec(body.slice(link.end));
    out += `${body.slice(at, link.start)}[${plain(titled ? (titled[1] as string) : label(link))}](${LINK}${i})`;
    at = link.end + (titled ? titled[0].length : 0);
  }
  return out + body.slice(at);
}

/** Why a link leads nowhere, for its marker and the list under the note. */
export const explain = (link: VaultLink) =>
  link.status === 'ambiguous'
    ? `${link.candidates.length} items match ${link.target}, and Mesa does not guess which one`
    : `no item in the vault matches ${link.target}`;

function LinkAt(props: { link: VaultLink; children: ReactNode; onSelect: Select }) {
  const { link } = props;
  if (link.status === 'resolved') {
    return (
      <button
        type="button"
        data-testid="vault-link"
        data-status="resolved"
        title={link.path}
        className="inline-flex items-center gap-1 text-left text-primary underline decoration-foreground/30 underline-offset-2 transition-colors hover:decoration-foreground"
        onClick={() => props.onSelect(link.path)}
      >
        {link.embed && <Paperclip aria-hidden className="size-3.5" />}
        {props.children}
      </button>
    );
  }
  const Icon = link.status === 'broken' ? Link2Off : CircleHelp;
  return (
    <span
      data-testid="vault-link"
      data-status={link.status}
      title={`${link.status}: ${explain(link)}`}
      className="inline-flex items-center gap-1 text-destructive underline decoration-dotted"
    >
      <Icon aria-label={link.status} className="size-3.5" />
      {props.children}
    </span>
  );
}

/** A note's Markdown with the links core found: a resolved one selects its item. */
export function NoteMarkdown(props: {
  body: string;
  links: readonly VaultLink[];
  onSelect: Select;
  testId?: string;
}) {
  const link = (href: string, children: ReactNode) => {
    const found = href.startsWith(LINK) ? props.links[Number(href.slice(LINK.length))] : undefined;
    return (
      found && (
        <LinkAt link={found} onSelect={props.onSelect}>
          {children}
        </LinkAt>
      )
    );
  };
  return (
    <div data-testid={props.testId} className={PROSE}>
      <MarkdownView text={linkedBody(props.body, props.links)} link={link} />
    </div>
  );
}
