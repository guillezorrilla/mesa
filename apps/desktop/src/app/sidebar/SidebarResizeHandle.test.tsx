// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { press } from '@/lib/testing';
import { SidebarResizeHandle } from './SidebarResizeHandle';
import { useSidebarWidth } from './useSidebarWidth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Sized() {
  const [width, setWidth] = useSidebarWidth();
  return <SidebarResizeHandle width={width} onWidth={setWidth} />;
}

let root: Root | undefined;
const render = async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root') as HTMLElement);
  await act(async () => root?.render(<Sized />));
  return document.querySelector<HTMLElement>('[role="separator"]') as HTMLElement;
};
const width = (handle: HTMLElement) => Number(handle.getAttribute('aria-valuenow'));
const pointer = (target: EventTarget, type: string, clientX: number) =>
  act(async () => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX }));
  });

beforeEach(() => localStorage.clear());
afterEach(async () => act(async () => root?.unmount()));

test('the handle is a labelled vertical separator at the default width', async () => {
  const handle = await render();
  expect(handle.getAttribute('aria-orientation')).toBe('vertical');
  expect(handle.getAttribute('aria-label')).toBe('Resize sidebar');
  expect(handle.className).toContain('cursor-col-resize');
  expect(width(handle)).toBe(264);
});

test('dragging sets the width live, clamped to 200 and 480, and stops on release', async () => {
  const handle = await render();
  await pointer(handle, 'pointerdown', 264);
  await pointer(document, 'pointermove', 300);
  expect(width(handle)).toBe(300);
  await pointer(document, 'pointermove', 900);
  expect(width(handle)).toBe(480);
  await pointer(document, 'pointermove', 10);
  expect(width(handle)).toBe(200);
  await pointer(document, 'pointermove', 340);
  await pointer(document, 'pointerup', 340);
  await pointer(document, 'pointermove', 400);
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
