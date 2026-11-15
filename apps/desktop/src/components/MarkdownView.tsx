import { Copy } from 'lucide-react';
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { IconButton } from './IconButton';

// Block and inline elements only: no HTML, no images, so nothing remote ever loads. With `gfm`,
// any other element GitHub's Markdown makes (a task box, a footnote) shows as its text.
const ALLOWED = [
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'del',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'em',
  'strong',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'hr',
  'br',
  'a',
];

type Node = { value?: string; children?: Node[] };
/** The text a parsed element holds, its children's joined. */
const textOf = (node: Node | undefined): string =>
  node?.value ?? (node?.children ?? []).map(textOf).join('');

/**
 * Markdown as inert React elements. A link is underlined text, unless `link` renders it from its
 * href; `link` returns undefined for one it leaves as text. With `onCopyCode`, each code block has
 * a Copy button that hands it its text. With `gfm`, GitHub's tables and strikethrough render too.
 */
export function MarkdownView(props: {
  text: string;
  link?: (href: string, children: ReactNode) => ReactNode;
  onCopyCode?: (code: string) => void;
  gfm?: boolean;
}) {
  const copy = props.onCopyCode;
  return (
    <Markdown
      skipHtml
      remarkPlugins={props.gfm ? [remarkGfm] : []}
      allowedElements={ALLOWED}
      unwrapDisallowed={props.gfm}
      components={{
        // A wide table scrolls sideways on its own, the text around it stays put.
        table: ({ children }) => (
          <div className="overflow-x-auto">
            <table>{children}</table>
          </div>
        ),
        a: ({ href, children }) =>
          (href === undefined ? undefined : props.link?.(href, children)) ?? (
            <span className="underline">{children}</span>
          ),
        ...(copy && {
          pre: ({ node, children }) => (
            <div className="group/code relative">
              <pre>{children}</pre>
              <IconButton
                label="Copy code"
                icon={Copy}
                className="absolute top-1 right-1 opacity-0 group-hover/code:opacity-100 focus-visible:opacity-100"
                onClick={() => copy(textOf(node as Node).replace(/\n$/, ''))}
              />
            </div>
          ),
        }),
      }}
    >
      {props.text}
    </Markdown>
  );
}
