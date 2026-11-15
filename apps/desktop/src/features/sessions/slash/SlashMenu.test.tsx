// @vitest-environment happy-dom
import type { SlashCommand } from '@mesa/core';
import { useState } from 'react';
import { expect, test } from 'vitest';
import { envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { SlashMenu } from './SlashMenu';
import { completion, slashGroups, slashQuery } from './slashMatches';
import { useSlashMenu } from './useSlashMenu';

const commands: SlashCommand[] = [
  { name: 'usage', description: 'Show plan usage', source: 'builtin' },
  { name: 'model', description: 'Choose the model', argumentHint: '[model]', source: 'builtin' },
  { name: 'ship', description: 'Ship it', source: 'project' },
  { name: 'lint', description: 'Lint things', source: 'skill' },
];

test('the menu opens only for a slash first with no space, and filters by name and description', () => {
  expect(slashQuery('/us')).toBe('us');
  expect(slashQuery('hi /us')).toBeUndefined();
  expect(slashQuery('/model gpt')).toBeUndefined();
  expect(slashGroups(commands, '').map((g) => g.label)).toEqual(['Built-in', 'Commands', 'Skills']);
  expect(slashGroups(commands, 'us').flatMap((g) => g.items.map((c) => c.name))).toEqual(['usage']);
  expect(slashGroups(commands, 'choose')[0]?.items[0]?.name).toBe('model');
  expect(
    slashGroups(
      [{ name: 'zeta', description: 'uses it', source: 'builtin' }, ...commands],
      'us',
    )[0]?.items.map((c) => c.name),
  ).toEqual(['usage', 'zeta']);
  expect(completion(commands[1] as SlashCommand)).toBe('/model ');
  expect(completion(commands[0] as SlashCommand)).toBe('/usage');
  expect(completion({ name: '$notes', description: '', source: 'skill' })).toBe('$notes');
});

function Harness(props: { start: string }) {
  const [text, setText] = useState(props.start);
  const slash = useSlashMenu('aaaaaaaa', text, setText);
  return (
    <div>
      <textarea
        data-testid="box"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={slash.onKeyDown}
      />
      {slash.groups.length > 0 && (
        <SlashMenu groups={slash.groups} active={slash.active} onPick={slash.pick} />
      )}
    </div>
  );
}

const key = (k: string) =>
  document
    .querySelector('[data-testid="box"]')
    ?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const flush = () => new Promise((r) => setTimeout(r, 0));
const box = () => document.querySelector<HTMLTextAreaElement>('[data-testid="box"]');
const names = () =>
  [...document.querySelectorAll('[cmdk-item] .font-mono')].map((n) => n.textContent);

test('typing /us offers /usage; arrows move, Tab completes, Esc closes', async () => {
  const { bridge, calls } = fakeBridge({ commands: () => envelope(commands) });
  await renderWithMesa(<Harness start="/" />, bridge);
  await flush();
  expect(calls.some((c) => c.includes('commands'))).toBe(true);
  expect(names()).toEqual(['/usage', '/model', '/ship', '/lint']);
  key('ArrowDown');
  await flush();
  expect(document.querySelector('[cmdk-item][data-selected="true"]')?.textContent).toContain(
    '/model',
  );
  key('Tab');
  await flush();
  expect(box()?.value).toBe('/model ');
  expect(document.querySelector('[cmdk-root]')).toBeNull();
});
