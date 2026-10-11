import type { Runner } from './process.js';
import { MesaError } from './result.js';

/** Secrets by service and account: the macOS Keychain for real, a map in tests. */
export type SecretStore = {
  get: (service: string, account: string) => Promise<string | undefined>;
  set: (service: string, account: string, value: string) => Promise<void>;
  /** False when there was nothing to delete. */
  delete: (service: string, account: string) => Promise<boolean>;
};

const OSASCRIPT = '/usr/bin/osascript';
const NOT_FOUND = '-25300';

// Every call goes through osascript: an item trusts only the binary that added it, so reading it
// with `security` asked for the Keychain password each time a refreshed token rewrote it. `set`
// reads the value from stdin: `security add-generic-password -w` would put it in argv, and
// `security -i` reads lines of at most 4096 bytes, which an Atlassian token pair can outgrow.
// Prints the OSStatus, and after a found item's 0 a space and its value.
const KEYCHAIN = `ObjC.import('Foundation');
ObjC.import('Security');
function run(argv) {
  const key = (name) => ObjC.castRefToObject($[name]);
  const item = $.NSMutableDictionary.alloc.init;
  item.setObjectForKey(key('kSecClassGenericPassword'), key('kSecClass'));
  item.setObjectForKey($(argv[1]), key('kSecAttrService'));
  item.setObjectForKey($(argv[2]), key('kSecAttrAccount'));
  if (argv[0] === 'delete') return $.SecItemDelete(item);
  if (argv[0] === 'get') {
    item.setObjectForKey($.NSNumber.numberWithBool(true), key('kSecReturnData'));
    const found = Ref();
    const status = $.SecItemCopyMatching(item, found);
    if (status !== 0) return status;
    const data = ObjC.castRefToObject(found[0]);
    return '0 ' + $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
  }
  $.SecItemDelete(item);
  item.setObjectForKey($.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile, key('kSecValueData'));
  return $.SecItemAdd(item, null);
}`;

// A locked Keychain asks the person for its password first.
const KEYCHAIN_MS = 60_000;

/** The login Keychain's generic passwords. Values are printable ASCII. */
export function keychainStore(run: Runner): SecretStore {
  const call = async (
    op: 'get' | 'set' | 'delete',
    service: string,
    account: string,
    input?: string,
  ) => {
    const ran = await run(
      OSASCRIPT,
      ['-l', 'JavaScript', '-e', KEYCHAIN, op, service, account],
      KEYCHAIN_MS,
      input === undefined ? undefined : { input },
    );
    const doing = op === 'get' ? 'read' : op === 'set' ? 'write' : op;
    if (!ran.ok)
      throw new MesaError('internal', `cannot ${doing} the Keychain item: ${ran.detail}`);
    const out = ran.stdout.replace(/\n$/, '');
    const status = out.split(' ', 1)[0] ?? '';
    if (status === '0') return out.slice(2);
    if (status === NOT_FOUND && op !== 'set') return undefined;
    throw new MesaError('internal', `cannot ${doing} the Keychain item: OSStatus ${status}`);
  };
  return {
    get: (service, account) => call('get', service, account),
    set: async (service, account, value) => {
      if (!/^[\x20-\x7e]*$/.test(value))
        throw new MesaError('internal', 'a Keychain value must be printable ASCII');
      await call('set', service, account, value);
    },
    delete: async (service, account) => (await call('delete', service, account)) !== undefined,
  };
}
