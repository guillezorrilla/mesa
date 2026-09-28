// @vitest-environment happy-dom

import { getCM } from '@replit/codemirror-vim';
import { EditorView } from 'codemirror';
import { act } from 'react';
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
