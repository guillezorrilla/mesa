import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { fakeHttp, fakeRelease, tempDir, testDeps } from '../testing/index.js';

const BROKER = 'https://broker.example.test';

function world(status = 201) {
  const web = fakeHttp({ [`POST ${BROKER}/feedback`]: { status, body: {} } });
  const mesa = createMesa(
    'default',
    testDeps(tempDir(), {
      http: web.http,
      env: { MESA_BROKER_URL: BROKER },
      release: fakeRelease(),
    }),
  );
  return { mesa, web };
}

test('feedback goes to the broker with the message, version, build, and where it was written', async () => {
  const { mesa, web } = world();
  expect(
    await mesa.feedback.send({ message: '  The board loses my place \n', from: 'sessions' }),
  ).toEqual({
    sent: true,
  });
  expect(web.requests).toHaveLength(1);
  expect(JSON.parse(web.requests[0]?.body ?? '')).toEqual({
    message: 'The board loses my place',
    version: '0.1.0-beta.4',
    build: '512',
    from: 'sessions',
  });
});

test('outside a release the build is dev', async () => {
  const web = fakeHttp({ [`POST ${BROKER}/feedback`]: { status: 201, body: {} } });
  const mesa = createMesa(
    'default',
    testDeps(tempDir(), { http: web.http, env: { MESA_BROKER_URL: BROKER } }),
  );
  await mesa.feedback.send({ message: 'hi', from: 'cli' });
  expect(JSON.parse(web.requests[0]?.body ?? '')).toMatchObject({ build: 'dev' });
});

test('an empty or too long message is a usage error and sends nothing', async () => {
  const { mesa, web } = world();
  await expect(mesa.feedback.send({ message: '  ', from: 'cli' })).rejects.toMatchObject({
    code: 'usage',
  });
  await expect(
    mesa.feedback.send({ message: 'x'.repeat(5001), from: 'cli' }),
  ).rejects.toMatchObject({
    code: 'usage',
  });
  expect(web.requests).toHaveLength(0);
});

test('a broker failure, a rate limit, or no network says it was not sent', async () => {
  await expect(world(502).mesa.feedback.send({ message: 'hi', from: 'cli' })).rejects.toThrow(
    "Couldn't send feedback, check your connection and try again",
  );
  await expect(world(429).mesa.feedback.send({ message: 'hi', from: 'cli' })).rejects.toThrow(
    'wait a minute',
  );
  const offline = createMesa(
    'default',
    testDeps(tempDir(), {
      http: async () => {
        throw new TypeError('fetch failed');
      },
    }),
  );
  await expect(offline.feedback.send({ message: 'hi', from: 'cli' })).rejects.toThrow(
    'check your connection',
  );
});
