import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const phonePair = defineCommand({
  name: 'phone pair',
  summary: "Show a QR the Mesa phone app scans to pair with this profile, through Mesa's broker",
  example: 'mesa phone pair',
  run: async ({ mesa }) => {
    const recorded = await mesa.phone.pair();
    const { text, ...data } = recorded.result;
    return recordedOutput(recorded, {
      data,
      text: [
        text,
        `Scan it with the Mesa app on your phone before ${data.expiresAt}, then run mesa phone status.`,
      ].join('\n'),
    });
  },
});

export const phoneStatus = defineCommand({
  name: 'phone status',
  summary: 'Say whether this profile is paired with a phone, confirming one that just scanned',
  example: 'mesa phone status',
  run: async ({ mesa }) => {
    const data = await mesa.phone.status();
    const text = data.paired
      ? `paired ${data.pairingId} since ${data.since}${data.phoneLastSeen ? `, phone last seen ${data.phoneLastSeen}` : ''}${data.listenerOutdated ? `; the listener still runs ${data.listenerVersion}` : ''}`
      : data.pending
        ? `waiting for the phone to scan ${data.pairingId} (until ${data.expiresAt})`
        : 'not paired';
    return { data, text };
  },
});

export const phoneBeta = defineCommand({
  name: 'phone beta',
  summary: "Show the form that invites you to the iPhone app's TestFlight beta, with its QR",
  example: 'mesa phone beta',
  run: async ({ mesa }) => {
    const { text, ...data } = mesa.phone.beta();
    return {
      data,
      text: [
        text,
        `Request an invite at ${data.url}, then pair with mesa phone pair or Settings > Phone > Pair phone.`,
      ].join('\n'),
    };
  },
});

export const phoneServe = defineCommand({
  name: 'phone serve',
  summary:
    'Answer the paired phone in the foreground: sessions, replies, output and live changes (the LaunchAgent runs this)',
  example: 'mesa phone serve',
  // Runs until the pairing ends or the process is stopped; a stopped one's lock is taken over.
  run: async ({ mesa }) => {
    const data = await mesa.phone.serve();
    const text =
      data.ended === 'not-paired'
        ? 'not paired; mesa phone pair first'
        : `the pairing ${data.pairingId} ended; stopped`;
    return { data, text };
  },
});

export const phoneUnpair = defineCommand({
  name: 'phone unpair',
  summary: 'End the pairing with the phone, on the broker and in the Keychain',
  example: 'mesa phone unpair',
  run: async ({ mesa }) => {
    const recorded = await mesa.phone.unpair();
    const { unpaired, pairingId, brokerRemoved } = recorded.result;
    return recordedOutput(recorded, {
      data: recorded.result,
      text: !unpaired
        ? 'not paired'
        : brokerRemoved
          ? `unpaired ${pairingId}`
          : `unpaired ${pairingId} here; the broker could not be reached, so it lapses there`,
    });
  },
});

export const phonePush = defineCommand({
  name: 'phone push',
  summary: 'Push new session notices to the paired phone, when phone.push allows it now',
  example: 'mesa phone push',
  run: async ({ mesa }) => {
    const data = await mesa.phone.push();
    const text =
      data.status === 'pushed' || data.status === 'failed'
        ? `pushed ${data.pushed.length}${data.failed.length ? `, ${data.failed.length} failed` : ''}`
        : data.status;
    return { data, text };
  },
});

export const phonePushTest = defineCommand({
  name: 'phone push-test',
  summary: 'Push a sealed test notice to the paired phone now, whatever the idle time',
  example: 'mesa phone push-test',
  run: async ({ mesa }) => {
    const data = await mesa.phone.pushTest();
    return { data, text: `pushed a test notice to ${data.pairingId}` };
  },
});
