// The pairing protocol (`@mesa/core/phone`): what the phone app bundles from core, and nothing else
// but the pure time words its screens share with the desktop (lib/ago.ts).
export { relativeAgo, shortAgo, timeAgo } from '../../lib/ago.js';
export { BOX_BYTES, fitsOneBox, type PartMessage, partJoiner, splitParts } from './chunk.js';
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
  type ConnectSocket,
  type MailboxEnd,
  type MailboxEvents,
  mailbox,
  type SocketEvents,
  webSocketConnect,
} from './mailbox.js';
export {
  NOTICE_MAX,
  type Notice,
  type NoticeKind,
  openNotice,
  sealNotice,
} from './notice.js';
export { MacCallError, macCalls } from './requests.js';
export {
  type CallResult,
  callResults,
  type PhoneCall,
  type PhoneDetail,
  type PhoneRow,
  phoneCall,
  phoneDetail,
  phoneRow,
  type ReplySegment,
  type UpdateMessage,
  WATCH_MS,
} from './rpc.js';
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
