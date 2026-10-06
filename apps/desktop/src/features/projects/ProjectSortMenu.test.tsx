// @vitest-environment happy-dom
import type { ProjectSort } from '@mesa/core';
import { useState } from 'react';
import { expect, test } from 'vitest';
import { click, fakeBridge, renderWithMesa } from '@/lib/testing';
import { ProjectSortMenu } from './ProjectSortMenu';

test('project sorting menu exposes five accessible choices, Name first, and marks the selected choice', async () => {
  const choices: ProjectSort[] = [];
  function Menu() {
    const [sort, setSort] = useState<ProjectSort>('recent');
    return (
      <ProjectSortMenu
        sort={sort}
        onSort={(next) => {
          choices.push(next);
          setSort(next);
        }}
      />
    );
  }
  const byTestId = await renderWithMesa(<Menu />, fakeBridge().bridge);
  await click(byTestId('project-sort')[0]);
  const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
  expect(items().map((item) => item.textContent?.trim())).toEqual([
    'Name',
    'Recent',
    'Last session',
    'Active sessions',
    'Most visited',
  ]);
  expect(items().map((item) => item.getAttribute('aria-checked'))).toEqual([
    'false',
    'true',
    'false',
    'false',
    'false',
  ]);
  await click(items()[4]);
  expect(choices).toEqual(['most-visited']);
  expect(items()).toHaveLength(0);
  await click(byTestId('project-sort')[0]);
  expect(items()[4]?.getAttribute('aria-checked')).toBe('true');
});
