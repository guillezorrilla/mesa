// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { TicketFieldsMenu } from './TicketFieldsMenu';

const item = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find((i) =>
    i.textContent?.includes(name),
  );

test('Customize fields shows the shown fields first, and picking one shows or hides it', async () => {
  const changes: string[][] = [];
  const { bridge } = fakeBridge({
    'tickets fields': () =>
      envelope({
        site: { id: 'cloud-1', name: 'lantern-cove' },
        fields: [
          { id: 'components', name: 'Components' },
          { id: 'customfield_10067', name: 'Severity (SLA)' },
          { id: 'customfield_10020', name: 'Sprint' },
          { id: 'sprint', name: 'Sprint' },
        ],
      }),
  });
  const byTestId = await renderWithMesa(
    <TicketFieldsMenu
      shown={[{ id: 'components', name: 'Components' }]}
      disabled={false}
      onChange={(ids) => changes.push(ids)}
    />,
    bridge,
  );
  const trigger = [...document.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Customize fields'),
  );
  await click(trigger);
  const menu = byTestId('ticket-fields-menu')[0]?.textContent ?? '';
  expect(menu).toContain('ShownComponents');
  // Two fields named Sprint show their ids.
  expect(menu).toContain('Sprintcustomfield_10020');
  await click(item('Severity (SLA)'));
  await click(item('Components'));
  expect(changes).toEqual([['components', 'customfield_10067'], []]);
});
