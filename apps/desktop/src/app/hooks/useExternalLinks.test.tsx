// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { useExternalLinks } from './useExternalLinks';

function Links() {
  useExternalLinks();
  return (
    <>
      <a
        href="https://github.com/apps/mesa-for-tickets/installations/new"
        target="_blank"
        rel="noopener noreferrer"
      >
        Give Mesa access
      </a>
      <a href="https://example.com/docs">Plain</a>
      <a href="#local">Local</a>
      <a href="mailto:crew@example.com">Mail</a>
    </>
  );
}

test('a click on a web link to another site opens it in the default browser, and only that', async () => {
  const { bridge, calls } = fakeBridge({
    'browser external': (args) => envelope({ url: args.at(-1), opened: true }),
  });
  await renderWithMesa(<Links />, bridge);
  const link = (text: string) =>
    [...document.querySelectorAll('a')].find((a) => a.textContent?.trim() === text);
  const opened = () => calls.filter((args) => args[1] === 'browser').map((args) => args.at(-1));
  await click(link('Give Mesa access'));
  await click(link('Plain'));
  await click(link('Local'));
  await click(link('Mail'));
  expect(opened()).toEqual([
    'https://github.com/apps/mesa-for-tickets/installations/new',
    'https://example.com/docs',
  ]);
});
