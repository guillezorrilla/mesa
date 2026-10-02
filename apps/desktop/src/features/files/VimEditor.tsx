import { EditorState } from '@codemirror/state';
import type { Config } from '@mesa/core';
import { vim } from '@replit/codemirror-vim';
import { basicSetup, EditorView } from 'codemirror';
import { useEffect, useRef } from 'react';

/** The editor in Vim mode: CodeMirror with Vim keys, opened at the target line. */
export function VimEditor(props: {
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
