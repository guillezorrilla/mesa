import type { Runner } from './process.js';
import { MesaError } from './result.js';

/** Secrets by service and account: the macOS Keychain for real, a map in tests. */
export type SecretStore = {
  get: (service: string, account: string) => Promise<string | undefined>;
  set: (service: string, account: string, value: string) => Promise<void>;
  /** False when there was nothing to delete. */
  delete: (service: string, account: string) => Promise<boolean>;
};

const SECURITY = '/usr/bin/security';
const NOT_FOUND = /could not be found/;

// Adds the item with the value read from stdin. `security add-generic-password -w` would put the
// value in argv, and `security -i` reads lines of at most 4096 bytes, which an Atlassian token
// pair can outgrow; osascript and security are both Apple's, so either reads the other's item.
const ADD = `ObjC.import('Foundation');
ObjC.import('Security');
function run(argv) {
  const key = (name) => ObjC.castRefToObject($[name]);
  const item = $.NSMutableDictionary.alloc.init;
  item.setObjectForKey(key('kSecClassGenericPassword'), key('kSecClass'));
  item.setObjectForKey($(argv[0]), key('kSecAttrService'));
  item.setObjectForKey($(argv[1]), key('kSecAttrAccount'));
  $.SecItemDelete(item);
  item.setObjectForKey($.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile, key('kSecValueData'));
  return $.SecItemAdd(item, null);
}`;

// A locked Keychain asks the person for its password first.
const KEYCHAIN_MS = 60_000;

/**
 * The login Keychain's generic passwords. Values are printable ASCII: `security -w` prints any
 * other value as hex, which could not be told from a value that is hex.
 */
export function keychainStore(run: Runner): SecretStore {
  const failed = (doing: string, detail: string) =>
    new MesaError('internal', `cannot ${doing} the Keychain item: ${detail}`);
  return {
    get: async (service, account) => {
      const found = await run(
        SECURITY,
        ['find-generic-password', '-s', service, '-a', account, '-w'],
        KEYCHAIN_MS,
      );
      if (found.ok) return found.stdout.replace(/\n$/, '');
      if (NOT_FOUND.test(found.detail)) return undefined;
      throw failed('read', found.detail);
    },
    set: async (service, account, value) => {
      if (!/^[\x20-\x7e]*$/.test(value))
        throw new MesaError('internal', 'a Keychain value must be printable ASCII');
      const added = await run(
        '/usr/bin/osascript',
        ['-l', 'JavaScript', '-e', ADD, service, account],
        KEYCHAIN_MS,
        { input: value },
      );
      if (!added.ok) throw failed('write', added.detail);
      if (added.stdout.trim() !== '0') throw failed('write', `OSStatus ${added.stdout.trim()}`);
    },
    delete: async (service, account) => {
      const gone = await run(
        SECURITY,
        ['delete-generic-password', '-s', service, '-a', account],
        KEYCHAIN_MS,
      );
      if (gone.ok) return true;
      if (NOT_FOUND.test(gone.detail)) return false;
      throw failed('delete', gone.detail);
    },
  };
}
