import type { Config } from '@mesa/core';
import { useEffect, useRef, useState } from 'react';
import { MarkdownView } from '@/components/MarkdownView';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { VimEditor } from './VimEditor';

/** Shared text editor; Markdown is rendered as inert React elements, without HTML or remote images. */
export function FileEditor(props: {
  path: string;
  value: string;
  initialText: string;
  onChange: (text: string) => void;
  targetLine?: number;
  preferences: Config['editor'];
  readOnly?: boolean;
}) {
  const [preview, setPreview] = useState(Boolean(props.readOnly));
  const textArea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!props.targetLine || preview || props.preferences.vim) return;
    const position =
      props.initialText
        .split('\n')
        .slice(0, props.targetLine - 1)
        .join('\n').length + (props.targetLine > 1 ? 1 : 0);
    textArea.current?.focus();
    textArea.current?.setSelectionRange(position, position);
  }, [props.targetLine, props.initialText, props.preferences.vim, preview]);
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
          <MarkdownView text={props.value} />
        </div>
      ) : props.preferences.vim && !props.readOnly ? (
        <VimEditor {...props} />
      ) : (
        <Textarea
          ref={textArea}
          data-testid="file-editor-text"
          aria-label={`Edit ${props.path}`}
          className="min-h-96 resize-y font-mono"
          style={{
            fontSize: props.preferences.fontSize,
            tabSize: props.preferences.tabSize,
            whiteSpace: props.preferences.wordWrap ? 'pre-wrap' : 'pre',
          }}
          spellCheck={false}
          readOnly={props.readOnly}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return;
            event.preventDefault();
            const input = event.currentTarget;
            const next = `${props.value.slice(0, input.selectionStart)}${' '.repeat(props.preferences.tabSize)}${props.value.slice(input.selectionEnd)}`;
            const position = input.selectionStart + props.preferences.tabSize;
            props.onChange(next);
            requestAnimationFrame(() => input.setSelectionRange(position, position));
          }}
        />
      )}
    </div>
  );
}
