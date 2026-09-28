import { EditorState } from '@codemirror/state';
import type { Config } from '@mesa/core';
import { vim } from '@replit/codemirror-vim';
import { basicSetup, EditorView } from 'codemirror';
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

function VimEditor(props: {
  path: string;
  value: string;
  onChange: (text: string) => void;
  targetLine?: number;
  preferences: Config['editor'];
}) {
  const host = useRef<HTMLFieldSetElement>(null);
  const view = useRef<EditorView>(null);
  const onChange = useRef(props.onChange);
  const currentText = useRef(props.value);
  currentText.current = props.value;
  const { fontSize, tabSize, wordWrap } = props.preferences;
  onChange.current = props.onChange;
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      doc: currentText.current,
      extensions: [
        vim({ status: true }),
        basicSetup,
        EditorState.tabSize.of(tabSize),
        ...(wordWrap ? [EditorView.lineWrapping] : []),
        EditorView.theme({
          '&': {
            fontSize: `${fontSize}px`,
            minHeight: '24rem',
            backgroundColor: 'var(--background)',
            color: 'var(--foreground)',
          },
          '.cm-gutters': { backgroundColor: 'var(--card)', color: 'var(--muted-foreground)' },
          '.cm-scroller': { fontFamily: 'monospace' },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange.current(update.state.doc.toString());
        }),
      ],
    });
    view.current = editor;
    return () => {
      view.current = null;
      editor.destroy();
    };
  }, [fontSize, tabSize, wordWrap]);
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === props.value) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: props.value } });
  }, [props.value]);
  useEffect(() => {
    const editor = view.current;
    if (!editor || !props.targetLine || props.targetLine > editor.state.doc.lines) return;
    const at = editor.state.doc.line(props.targetLine).from;
    editor.dispatch({ selection: { anchor: at }, scrollIntoView: true });
    editor.focus();
  }, [props.targetLine]);
  return (
    <fieldset ref={host} data-testid="file-editor-vim">
      <legend className="sr-only">Edit {props.path}</legend>
    </fieldset>
  );
}
