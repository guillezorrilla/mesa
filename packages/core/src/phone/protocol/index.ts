// The pairing protocol (`@mesa/core/phone`): what the phone app bundles from core, and nothing else.
export {
  type Delivery,
  type Fetch,
  type PairingClient,
  PairingError,
  type PairingInfo,
  pairingClient,
} from './client.js';
export {
  type Opened,
  openDeliveries,
  openMessage,
  type PhoneMessage,
  phoneMessage,
  sealMessage,
} from './envelope.js';
export { joinPairing, type PhonePairing, phoneKeys } from './join.js';
export { formatPairingLink, type PairingLink, parsePairingLink } from './link.js';
export {
  base64url,
  type Direction,
  fromBase64url,
  hashOf,
  newKeyPair,
  newSecret,
  open,
  type SideKeys,
  seal,
  sideKeys,
} from './seal.js';
