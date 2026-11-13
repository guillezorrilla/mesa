// The pairing protocol (`@mesa/core/phone`): what the phone app bundles from core, and nothing else
// but the pure words, local day, session state sets, prompt title, diff lines, push modes and agent
// names its screens share with the desktop.
export { AGENT_LABELS, AGENT_NAMES, agentLabel } from '../../agents/names.js';
export {
  DIFF_START,
  type DiffAt,
  type DiffLine,
  diffLines,
  noteLines,
} from '../../git/diff-lines.js';
export { relativeAgo, shortAgo, timeAgo } from '../../lib/ago.js';
export { money } from '../../lib/format.js';
export { localDay } from '../../lib/time.js';
export { promptTitle } from '../../sessions/answer/title.js';
export { NAMED_KEYS } from '../../sessions/input/terminal-keys.js';
export { BUSY_STATES, FINAL_STATES, WAITING_STATES } from '../../sessions/record/states.js';
export { PHONE_PUSH_LABELS, PHONE_PUSH_MODES, type PhonePushMode } from '../away.js';
export type { ChangedFile, NoteDelivery, StatusFile } from './changes.js';
export { BOX_BYTES, fitsOneBox, type PartMessage, partJoiner, splitParts } from './chunk.js';
export {
  type Delivery,
  type Fetch,
  type PairingClient,
  PairingError,
  type PairingInfo,
  pairingClient,
} from './client.js';
export type {
  GateAdvice,
  PhoneCrew,
  PhoneGate,
  PhoneMerge,
  PhoneTask,
  PhoneWorker,
} from './crew.js';
export {
  type Opened,
  openDeliveries,
  openMessage,
  type PhoneMessage,
  phoneMessage,
  sealMessage,
} from './envelope.js';
export type { PhoneNotice } from './inbox.js';
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
export type { PhonePushes } from './pushes.js';
export { MacCallError, macCalls } from './requests.js';
export {
  type CallResult,
  callResults,
  type PhoneCall,
  type PhoneDetail,
  type PhonePrompt,
  type PhoneRow,
  phoneCall,
  phoneDetail,
  phonePrompt,
  phoneRow,
  type ReplySegment,
  SESSION_REPLIES,
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
export {
  type PhoneConversation,
  type PhoneTicket,
  type PhoneTicketDetail,
  PLACES,
  type Place,
  type StartCall,
  type StartResult,
} from './start.js';
export {
  IMAGE_MAX,
  type QueuedMessage,
  SESSION_ACTIONS,
  type SendResult,
  type SessionAction,
} from './steer.js';
export type { PhoneSessionUsage, PhoneUsage } from './usage.js';
