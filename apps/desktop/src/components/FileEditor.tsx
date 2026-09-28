import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/** Shared text editor; Markdown is rendered as inert React elements, without HTML or remote images. */
export function FileEditor(props: {
  path: string;
  value: string;
  initialText: string;
  onChange: (text: string) => void;
  targetLine?: number;
}) {
  const [preview, setPreview] = useState(false);
  const textArea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!props.targetLine || preview) return;
    const position =
      props.initialText
        .split('\n')
        .slice(0, props.targetLine - 1)
        .join('\n').length + (props.targetLine > 1 ? 1 : 0);
    textArea.current?.focus();
    textArea.current?.setSelectionRange(position, position);
  }, [props.targetLine, props.initialText, preview]);
  const markdown = /\.md(?:own)?$/i.test(props.path);
  return (
    <div className="min-h-0 flex-1 space-y-3">
      {markdown && (
        <section className="flex gap-2" aria-label="Editor mode">
          <Button
            type="button"
            size="sm"
            variant={preview ? 'ghost' : 'secondary'}
            onClick={() => setPreview(false)}
          >
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant={preview ? 'secondary' : 'ghost'}
            onClick={() => setPreview(true)}
          >
            Preview
          </Button>
        </section>
      )}
      {markdown && preview ? (
        <div
          data-testid="markdown-preview"
          className="prose prose-sm max-w-none overflow-auto rounded-md border p-4 text-sm"
        >
          <Markdown
            skipHtml
            allowedElements={[
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
            ]}
            components={{ a: ({ children }) => <span className="underline">{children}</span> }}
          >
            {props.value}
          </Markdown>
        </div>
      ) : (
        <Textarea
          ref={textArea}
          data-testid="file-editor-text"
          aria-label={`Edit ${props.path}`}
          className="min-h-96 resize-y font-mono text-xs"
          spellCheck={false}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
    </div>
  );
}
