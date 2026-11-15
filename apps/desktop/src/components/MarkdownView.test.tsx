// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { fakeBridge, renderWithMesa } from '@/lib/testing';
import { MarkdownView } from './MarkdownView';

const TABLE = '| Port | Tide |\n| --- | --- |\n| Lisbon | 06:12 |\n\n~~old~~';

test("only gfm draws GitHub's tables and strikethrough; without it the text stays as written", async () => {
  await renderWithMesa(
    <>
      <div data-testid="plain">
        <MarkdownView text={TABLE} />
      </div>
      <div data-testid="gfm">
        <MarkdownView text={TABLE} gfm />
      </div>
    </>,
    fakeBridge().bridge,
  );
  const plain = document.querySelector('[data-testid="plain"]');
  expect(plain?.querySelector('table')).toBeNull();
  expect(plain?.textContent).toContain('| Lisbon | 06:12 |');
  const gfm = document.querySelector('[data-testid="gfm"]');
  expect([...(gfm?.querySelectorAll('td') ?? [])].map((td) => td.textContent)).toEqual([
    'Lisbon',
    '06:12',
  ]);
  expect(gfm?.querySelector('del')?.textContent).toBe('old');
});
