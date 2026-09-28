// @vitest-environment happy-dom

import { getCM } from '@replit/codemirror-vim';
import { EditorView } from 'codemirror';
import { act, useState } from 'react';
import { expect, test } from 'vitest';
import { fakeBridge, renderWithMesa } from '@/lib/testing';
import { FileEditor } from './FileEditor';

test('Vim normal mode moves by lines without editing the file', async () => {
  let changed = '';
  const { bridge } = fakeBridge();
  const byTestId = await renderWithMesa(
    <FileEditor
      path="guide.md"
      value={'one\ntwo\n'}
      initialText={'one\ntwo\n'}
      onChange={(text) => {
        changed = text;
      }}
      preferences={{ fontSize: 13, tabSize: 2, wordWrap: false, vim: true, external: [] }}
    />,
    bridge,
  );
  const host = byTestId('file-editor-vim')[0];
  if (!host) throw new Error('Vim editor not mounted');
  const editor = EditorView.findFromDOM(host.querySelector('.cm-editor') as HTMLElement);
  expect(editor).not.toBeNull();
  expect(editor && getCM(editor)).not.toBeNull();
  expect(editor?.state.selection.main.head).toBe(0);
  await act(async () => {
    editor?.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
  });
  expect(editor?.state.doc.toString()).toBe('one\ntwo\n');
  expect(editor?.state.selection.main.head).toBeGreaterThan(0);
  expect(changed).toBe('');
});

test('Vim keeps unsaved text when display preferences rebuild its view', async () => {
  function Harness() {
    const [value, setValue] = useState('first');
    const [fontSize, setFontSize] = useState(13);
    return (
      <>
        <button type="button" onClick={() => setFontSize(14)}>
          Larger
        </button>
        <FileEditor
          path="draft.txt"
          value={value}
          initialText="first"
          onChange={setValue}
          preferences={{ fontSize, tabSize: 2, wordWrap: false, vim: true, external: [] }}
        />
      </>
    );
  }
  const { bridge } = fakeBridge();
  const byTestId = await renderWithMesa(<Harness />, bridge);
  const current = () =>
    EditorView.findFromDOM(
      byTestId('file-editor-vim')[0]?.querySelector('.cm-editor') as HTMLElement,
    );
  await act(async () => current()?.dispatch({ changes: { from: 0, to: 5, insert: 'unsaved' } }));
  expect(current()?.state.doc.toString()).toBe('unsaved');
  await act(async () => document.querySelector('button')?.click());
  expect(current()?.state.doc.toString()).toBe('unsaved');
});
