import { expect, test } from 'vitest';
import type { Runner } from './process.js';
import { keychainStore } from './secret-store.js';

const MISSING =
  'security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.';

/** security and osascript over a map of items, every call recorded with its stdin. */
function keychain() {
  const items = new Map<string, string>();
  const calls: { file: string; args: string[]; input?: string }[] = [];
  const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];
  const run: Runner = async (file, args, _ms, options) => {
    calls.push({ file, args, ...(options?.input === undefined ? {} : { input: options.input }) });
    if (file === '/usr/bin/osascript') {
      items.set(`${args.at(-2)} ${args.at(-1)}`, options?.input ?? '');
      return { ok: true, stdout: '0\n' };
    }
    const key = `${flag(args, '-s')} ${flag(args, '-a')}`;
    const value = items.get(key);
    if (value === undefined) return { ok: false, reason: 'failed', detail: MISSING };
    if (args[0] === 'delete-generic-password') items.delete(key);
    return { ok: true, stdout: args[0] === 'find-generic-password' ? `${value}\n` : '' };
  };
  return { run, items, calls };
}

test('the value goes in on stdin, never in argv, and reads back as written', async () => {
  const k = keychain();
  const store = keychainStore(k.run);
  const value = JSON.stringify({ accessToken: 'token-1', note: 'a "quoted" \\ value' });
  await store.set('mesa.default.sources', 'atlassian', value);
  expect(k.calls[0]).toMatchObject({ file: '/usr/bin/osascript', input: value });
  expect(k.calls[0]?.args.slice(0, 2)).toEqual(['-l', 'JavaScript']);
  expect(k.calls[0]?.args.slice(-2)).toEqual(['mesa.default.sources', 'atlassian']);
  expect(await store.get('mesa.default.sources', 'atlassian')).toBe(value);
  expect(k.calls[1]?.args).toEqual([
    'find-generic-password',
    '-s',
    'mesa.default.sources',
    '-a',
    'atlassian',
    '-w',
  ]);
  expect(k.calls.flatMap((c) => c.args).filter((a) => a.includes('token-1'))).toEqual([]);
});

test('a missing item reads as none and deletes as false', async () => {
  const store = keychainStore(keychain().run);
  expect(await store.get('mesa.default.sources', 'atlassian')).toBeUndefined();
  expect(await store.delete('mesa.default.sources', 'atlassian')).toBe(false);
  await store.set('mesa.default.sources', 'atlassian', '{}');
  expect(await store.delete('mesa.default.sources', 'atlassian')).toBe(true);
  expect(await store.get('mesa.default.sources', 'atlassian')).toBeUndefined();
});

test('a value past printable ASCII, a refused write, and a failing Keychain are errors', async () => {
  const store = keychainStore(keychain().run);
  await expect(store.set('s', 'a', 'José')).rejects.toMatchObject({ code: 'internal' });
  const refusing = keychainStore(async () => ({ ok: true, stdout: '-25308\n' }));
  await expect(refusing.set('s', 'a', 'v')).rejects.toMatchObject({
    message: 'cannot write the Keychain item: OSStatus -25308',
  });
  const locked = keychainStore(async () => ({ ok: false, reason: 'failed', detail: 'locked' }));
  await expect(locked.get('s', 'a')).rejects.toMatchObject({ code: 'internal' });
  await expect(locked.delete('s', 'a')).rejects.toMatchObject({ code: 'internal' });
});
