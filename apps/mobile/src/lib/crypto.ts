import { getRandomValues } from 'expo-crypto';

// The pairing protocol draws keys and nonces from crypto.getRandomValues (via @noble), which
// Hermes may not provide; expo-crypto's is the system's secure random source.
// ponytail: a guarded global, set once before anything seals.
if (typeof globalThis.crypto?.getRandomValues !== 'function')
  Object.defineProperty(globalThis, 'crypto', {
    value: { ...globalThis.crypto, getRandomValues },
    configurable: true,
  });
