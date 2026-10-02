import { expect, test } from 'vitest';
import { loopbackListener } from './callback-listener.js';

test('the listener answers the browser and resolves with the first /callback query', async () => {
  const listener = await loopbackListener(5000)();
  const base = `http://127.0.0.1:${listener.port}`;
  expect((await fetch(`${base}/favicon.ico`)).status).toBe(404);
  const page = await fetch(`${base}/callback?code=c1&state=n1.${listener.port}`);
  expect(page.status).toBe(200);
  expect(page.headers.get('content-type')).toContain('text/html');
  expect(await page.text()).toContain('You can close this tab');
  expect(Object.fromEntries(await listener.callback)).toEqual({
    code: 'c1',
    state: `n1.${listener.port}`,
  });
});

test('a sign-in that never comes back times out', async () => {
  const listener = await loopbackListener(10)();
  await expect(listener.callback).rejects.toMatchObject({ code: 'timeout' });
});
