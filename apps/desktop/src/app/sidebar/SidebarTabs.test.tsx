// @vitest-environment happy-dom
import type { SidebarTabId } from '@mesa/core/browser';
import { act } from 'react';
import { afterEach, expect, test } from 'vitest';
import { useSidebarTabs } from '@/features/sidebar/useSidebarTabs';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { HEALTHY } from '@/lib/testing/healthy';
import { SidebarTabs } from './SidebarTabs';

type Sidebar = { tabs?: { id: string; shown: boolean }[]; tabStyle: string };

/** A bridge whose config keeps what `config set sidebar.*` writes. */
function bridgeWith(sidebar: Sidebar) {
  const base = (HEALTHY.config as (args: string[]) => { data: object })([]).data;
  let current = sidebar;
  return fakeBridge({
    config: () => envelope({ ...base, sidebar: current }),
    'config set': (args) => {
      const key = String(args[4]).replace('sidebar.', '');
      current = { ...current, [key]: JSON.parse(String(args[5])) };
      return envelope({ path: args[4], value: JSON.parse(String(args[5])) });
    },
  });
}

function Bar(props: { tab?: SidebarTabId }) {
  const settings = useSidebarTabs();
  return (
    <>
      <button type="button" onClick={() => void settings.setOrder(['logs', 'reviews'])}>
        Logs first
      </button>
      <BarOnly settings={settings} tab={props.tab} />
    </>
  );
}

function BarOnly(props: { settings: ReturnType<typeof useSidebarTabs>; tab?: SidebarTabId }) {
  return (
    <SidebarTabs
      settings={props.settings}
      tab={props.tab ?? 'sessions'}
      counts={{ sessions: 2, reviews: 3 }}
      waiting={0}
      onTab={() => {}}
    />
  );
}

const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
/** Each tab's label when it shows, else '' (a hidden one is still read out). */
const shownLabels = () =>
  tabs().map((tab) =>
    [...tab.querySelectorAll('span')].some(
      (span) => span.textContent === tab.title && span.className !== 'sr-only',
    )
      ? tab.title
      : '',
  );
const bar = () => document.querySelector<HTMLElement>('[role="tablist"]');
const byLabel = (label: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${label}"]`) ?? undefined;
/** A style's option, by its name (a note may follow it). */
const radio = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find((item) =>
    item.textContent?.startsWith(name),
  );
const openPopover = async () => {
  await click(byLabel('Tab bar menu'));
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
      item.textContent?.includes('Customize tabs'),
    ),
  );
};

afterEach(() => {
  for (const key of ['scrollWidth', 'clientWidth'])
    delete (HTMLElement.prototype as unknown as Record<string, number>)[key];
});

test('Labels labels every tab, Compact only the active one, Icons none with counts as badges', async () => {
  const { bridge } = bridgeWith({ tabStyle: 'labels' });
  await renderWithMesa(<Bar tab="projects" />, bridge);
  expect(tabs().map((tab) => tab.title)).toEqual(['Sessions', 'Projects', 'Reviews', 'Logs']);
  expect(shownLabels()).toEqual(['Sessions', 'Projects', 'Reviews', 'Logs']);
  await openPopover();
  await click(radio('Compact'));
  expect(bar()?.dataset.style).toBe('compact');
  expect(shownLabels()).toEqual(['', 'Projects', '', '']);
  await click(radio('Icons'));
  expect(bar()?.dataset.style).toBe('icons');
  expect(shownLabels()).toEqual(['', '', '', '']);
  // Counts stay, as small badges on the icons.
  expect(tabs()[2]?.textContent).toBe('Reviews3');
});

test('a style too wide for the bar falls back to the next denser one by itself', async () => {
  // The test DOM lays nothing out: Labels needs 400px, Compact 260px, Icons 120px, of 200px.
  const need: Record<string, number> = { labels: 400, compact: 260, icons: 120 };
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return need[this.dataset.style ?? ''] ?? 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 200,
  });
  const { bridge } = bridgeWith({ tabStyle: 'labels' });
  await renderWithMesa(<Bar />, bridge);
  expect(bar()?.dataset.style).toBe('icons');
  need.compact = 180;
  const { bridge: other } = bridgeWith({ tabStyle: 'labels' });
  document.body.innerHTML = '';
  await renderWithMesa(<Bar />, other);
  expect(bar()?.dataset.style).toBe('compact');
});

// Widths measured in Chromium with two counts: the bar is 187px in the default 264px sidebar and
// 123px in the 200px minimum; Labels needs 176px (each tab's label cut to 3 characters), Compact
// 205px, Icons 126px.
const NEED: Record<string, number> = { labels: 176, compact: 205, icons: 126 };
function barOf(client: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return NEED[this.dataset.style ?? ''] ?? 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => client,
  });
}

test('Labels shows every tab in the default sidebar, its option with no note', async () => {
  barOf(187);
  await renderWithMesa(<Bar />, bridgeWith({ tabStyle: 'labels' }).bridge);
  expect(bar()?.dataset.style).toBe('labels');
  expect(shownLabels()).toEqual(['Sessions', 'Projects', 'Reviews', 'Logs']);
  await openPopover();
  expect(radio('Labels')?.textContent).toBe('Labels');
});

test('Labels gives way in the minimum sidebar, and its option says it needs a wider one', async () => {
  barOf(123);
  await renderWithMesa(<Bar />, bridgeWith({ tabStyle: 'labels' }).bridge);
  expect(bar()?.dataset.style).not.toBe('labels');
  await openPopover();
  expect(radio('Labels')?.textContent).toBe('LabelsNeeds a wider sidebar');
  expect(radio('Compact')?.textContent).toBe('Compact');
});

test('right-click opens the controls: Sessions and Projects locked, a switch hides Reviews at once and saves it', async () => {
  const { bridge, calls } = bridgeWith({
    tabs: [
      { id: 'logs', shown: true },
      { id: 'reviews', shown: true },
    ],
    tabStyle: 'compact',
  });
  await renderWithMesa(<Bar />, bridge);
  // The stored order: Logs before Reviews.
  expect(tabs().map((tab) => tab.title)).toEqual(['Sessions', 'Projects', 'Logs', 'Reviews']);
  await act(async () => {
    bar()?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  const panel = document.querySelector('[data-testid="customize-tabs"]');
  expect(panel).not.toBeNull();
  for (const locked of ['Sessions always shows', 'Projects always shows']) {
    expect(byLabel(locked)?.getAttribute('aria-checked')).toBe('true');
    expect(byLabel(locked)?.hasAttribute('disabled')).toBe(true);
  }
  expect(byLabel('Move Reviews')).toBeDefined();
  expect(byLabel('Move Sessions')).toBeUndefined();
  await click(byLabel('Show Reviews'));
  expect(tabs().map((tab) => tab.title)).toEqual(['Sessions', 'Projects', 'Logs']);
  expect(calls).toContainEqual([
    '--json',
    'config',
    'set',
    '--',
    'sidebar.tabs',
    JSON.stringify([
      { id: 'logs', shown: true },
      { id: 'reviews', shown: false },
    ]),
  ]);
});

test("a new order (the drag's setOrder) shows at once, is saved, and holds after a reload", async () => {
  const { bridge, calls } = bridgeWith({ tabStyle: 'compact' });
  await renderWithMesa(<Bar />, bridge);
  expect(tabs().map((tab) => tab.title)).toEqual(['Sessions', 'Projects', 'Reviews', 'Logs']);
  await click(
    [...document.querySelectorAll<HTMLElement>('button')].find(
      (button) => button.textContent === 'Logs first',
    ),
  );
  expect(tabs().map((tab) => tab.title)).toEqual(['Sessions', 'Projects', 'Logs', 'Reviews']);
  expect(calls).toContainEqual([
    '--json',
    'config',
    'set',
    '--',
    'sidebar.tabs',
    JSON.stringify([
      { id: 'logs', shown: true },
      { id: 'reviews', shown: true },
    ]),
  ]);
  // A restart: a fresh app over the same saved config.
  document.body.innerHTML = '';
  await renderWithMesa(<Bar />, bridge);
  expect(tabs().map((tab) => tab.title)).toEqual(['Sessions', 'Projects', 'Logs', 'Reviews']);
});
