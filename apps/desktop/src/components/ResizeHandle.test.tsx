// @vitest-environment happy-dom
import { act } from 'react';
import { beforeEach, expect, test } from 'vitest';
import { fakeBridge, pointer, press, renderWithMesa } from '@/lib/testing';
import { useKeptWidth } from '@/lib/useKeptWidth';
import { ResizeHandle } from './ResizeHandle';

const BOUNDS = { min: 200, max: 480, initial: 264, step: 16 };

function Sized(props: { edge: 'left' | 'right' }) {
  const [width, setWidth] = useKeptWidth('mesa.sidebar.width', BOUNDS);
  return (
    <ResizeHandle
      label="Resize sidebar"
      edge={props.edge}
      width={width}
      bounds={BOUNDS}
      onWidth={setWidth}
    />
  );
}

const render = async (edge: 'left' | 'right' = 'right') => {
  await renderWithMesa(<Sized edge={edge} />, fakeBridge().bridge);
  return document.querySelector<HTMLElement>('[role="separator"]') as HTMLElement;
};
const width = (handle: HTMLElement) => Number(handle.getAttribute('aria-valuenow'));

beforeEach(() => localStorage.clear());

test('the handle is a labelled vertical separator at the default width', async () => {
  const handle = await render();
  expect(handle.getAttribute('aria-orientation')).toBe('vertical');
  expect(handle.getAttribute('aria-label')).toBe('Resize sidebar');
  expect(handle.className).toContain('cursor-col-resize');
  expect(width(handle)).toBe(264);
});

test('dragging sets the width live, clamped to 200 and 480, and stops on release', async () => {
  const handle = await render();
  await pointer(handle, 'pointerdown', { clientX: 264 });
  await pointer(document, 'pointermove', { clientX: 300 });
  expect(width(handle)).toBe(300);
  await pointer(document, 'pointermove', { clientX: 900 });
  expect(width(handle)).toBe(480);
  await pointer(document, 'pointermove', { clientX: 10 });
  expect(width(handle)).toBe(200);
  await pointer(document, 'pointermove', { clientX: 340 });
  await pointer(document, 'pointerup', { clientX: 340 });
  await pointer(document, 'pointermove', { clientX: 400 });
  expect(width(handle)).toBe(340);
  await pointer(handle, 'pointerdown', { clientX: 340 });
  await pointer(document, 'pointercancel', { clientX: 340 });
  await pointer(document, 'pointermove', { clientX: 400 });
  expect(width(handle)).toBe(340);
});

test('Left and Right step the width by 16 within the bounds', async () => {
  const handle = await render();
  await press(handle, 'ArrowRight');
  expect(width(handle)).toBe(280);
  await press(handle, 'ArrowLeft');
  await press(handle, 'ArrowLeft');
  expect(width(handle)).toBe(248);
  for (let i = 0; i < 5; i++) await press(handle, 'ArrowLeft');
  expect(width(handle)).toBe(200);
});

test('a double-click puts the default width back', async () => {
  const handle = await render();
  await press(handle, 'ArrowRight');
  await act(async () => {
    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  expect(width(handle)).toBe(264);
});

test('the width is kept and read back; a missing or invalid value falls back to 264', async () => {
  await press(await render(), 'ArrowRight');
  expect(localStorage.getItem('mesa.sidebar.width')).toBe('280');
  expect(width(await render())).toBe(280);
  for (const kept of ['wide', '9999', '12', '']) {
    localStorage.setItem('mesa.sidebar.width', kept);
    expect(width(await render())).toBe(264);
  }
});

test('a left edge grows the panel as it moves left, by drag and by key', async () => {
  const handle = await render('left');
  await pointer(handle, 'pointerdown', { clientX: 800 });
  await pointer(document, 'pointermove', { clientX: 760 });
  expect(width(handle)).toBe(304);
  await pointer(document, 'pointerup', { clientX: 760 });
  await press(handle, 'ArrowLeft');
  expect(width(handle)).toBe(320);
  await press(handle, 'ArrowRight');
  expect(width(handle)).toBe(304);
});
