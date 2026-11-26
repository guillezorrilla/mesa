// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { attached, click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { CloudReadAlert } from './CloudReadAlert';

const SIGNED_OUT = {
  code: 'invalid_config' as const,
  message:
    'Google asks you to sign in to gcloud again, which a read in the background cannot answer: sign in to Google Cloud',
  details: { reason: 'reauth', fix: 'gcloud auth login', action: 'login' },
};
const button = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes(text));

/** `logs login` answered when the test says, as gcloud ends when the person finishes. */
function pendingLogin() {
  let finish: (answer: unknown) => void = () => {};
  const answer = () => new Promise((resolve) => (finish = resolve));
  return { answer, finish: (a: unknown) => finish(a) };
}

test('Sign in to Google Cloud runs logs login, says to finish in the browser, and reads again once it ends', async () => {
  const login = pendingLogin();
  const { bridge, calls } = fakeBridge({ 'logs login': login.answer });
  let retried = 0;
  await renderWithMesa(<CloudReadAlert error={SIGNED_OUT} onRetry={() => retried++} />, bridge);
  expect(document.body.textContent).toContain('gcloud auth login');
  await click(button('Sign in to Google Cloud'));
  expect(calls.at(-1)?.slice(1)).toEqual(['logs', 'login']);
  expect(document.body.textContent).toContain('Finish signing in in your browser');
  login.finish(envelope({ signedIn: true }));
  await attached();
  expect(retried).toBe(1);
  expect(document.body.textContent).not.toContain('Finish signing in');
});

test('Cancel stops waiting; a sign-in that ends later does not read again', async () => {
  const login = pendingLogin();
  const { bridge } = fakeBridge({ 'logs login': login.answer });
  let retried = 0;
  await renderWithMesa(<CloudReadAlert error={SIGNED_OUT} onRetry={() => retried++} />, bridge);
  await click(button('Sign in to Google Cloud'));
  await click(button('Cancel'));
  expect(button('Sign in to Google Cloud')).toBeDefined();
  login.finish(envelope({ signedIn: true }));
  await attached();
  expect(retried).toBe(0);
});

test("a failed sign-in shows gcloud's message and opens the same command in a terminal session", async () => {
  const { bridge, calls } = fakeBridge({
    'logs login': () => ({
      ok: false,
      error: {
        code: 'internal',
        message: 'gcloud auth login failed: There was a problem with web authentication.',
      },
    }),
    open: () => envelope({ id: 's1' }),
  });
  await renderWithMesa(<CloudReadAlert error={SIGNED_OUT} onRetry={() => {}} />, bridge);
  await click(button('Sign in to Google Cloud'));
  await attached();
  expect(document.body.textContent).toContain('problem with web authentication');
  await click(button('Open in a terminal'));
  await attached();
  expect(calls.find((argv) => argv[1] === 'open')).toEqual(
    expect.arrayContaining(['--terminal', '--run=gcloud auth login', '--general']),
  );
});

test('Enable turns on Error Reporting only after a confirmation that names the project and says it changes it', async () => {
  const { bridge, calls } = fakeBridge({
    'logs enable': () =>
      envelope({ project: 'tide-tables-123', enabled: 'clouderrorreporting.googleapis.com' }),
  });
  let retried = 0;
  await renderWithMesa(
    <CloudReadAlert
      warnings={[
        {
          project: 'tide-tables-123',
          message: 'Error Reporting could not be read for tide-tables-123',
          fix: 'gcloud services enable clouderrorreporting.googleapis.com --project tide-tables-123',
          action: 'enable',
        },
      ]}
      onRetry={() => retried++}
    />,
    bridge,
  );
  await click(button('Enable'));
  const dialog = document.querySelector('[data-testid="enable-api-dialog"]');
  expect(dialog?.textContent).toContain('tide-tables-123');
  expect(dialog?.textContent).toContain('a change to that project');
  expect(calls.some((argv) => argv[2] === 'enable')).toBe(false);
  await click(
    document.querySelector<HTMLElement>('[data-testid="confirm-enable-api"]') ?? undefined,
  );
  await attached();
  expect(calls.find((argv) => argv[2] === 'enable')?.slice(1)).toEqual([
    'logs',
    'enable',
    '--',
    'tide-tables-123',
  ]);
  expect(retried).toBe(1);
});
