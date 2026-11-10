// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { PORTS_POLL_MS, PortsMenu } from './PortsMenu';

const url = (session: string, sessionName: string, port: number, listening: boolean | null) => ({
  session,
  sessionName,
  url: `http://localhost:${port}/`,
  host: 'localhost',
  port,
  listening,
});
const globe = () => document.querySelector<HTMLElement>('[data-testid="nav-ports"]');
const item = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((each) =>
    each.textContent?.includes(text),
  );

test('Globe counts the listening URLs, lists each under its session, opens one, and goes to the session', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    let ports = [url('aaaaaaaa', 'harbour ui', 5173, false)];
    const went: string[] = [];
    const { bridge, calls } = fakeBridge({
      ports: () => envelope({ ports }),
      'browser external': (args) => envelope({ url: args.at(-1), opened: true }),
    });
    await act(async () => window.dispatchEvent(new Event('focus')));
    await renderWithMesa(<PortsMenu onSession={(id) => went.push(id)} />, bridge);
    expect(globe()).toBeNull();

    ports = [url('bbbbbbbb', 'tide api', 3000, true), url('aaaaaaaa', 'harbour ui', 5173, false)];
    await act(async () => vi.advanceTimersByTime(PORTS_POLL_MS));
    expect(globe()?.textContent).toBe('1');
    await click(globe() ?? undefined);
    const menu = document.querySelector('[role="menu"]')?.textContent ?? '';
    // Each session's name, then its URLs, then Go to session; listening sessions first.
    expect(menu).toMatch(/^tide api.*3000.*Go to session.*harbour ui.*5173.*Go to session$/);
    expect(item('http://localhost:5173/')?.textContent).toContain('closed');
    await click(item('http://localhost:3000/'));
    expect(calls).toContainEqual(['--json', 'browser', 'external', '--', 'http://localhost:3000/']);
    await click(globe() ?? undefined);
    await click(item('Go to session'));
    expect(went).toEqual(['bbbbbbbb']);
  } finally {
    vi.useRealTimers();
  }
});
