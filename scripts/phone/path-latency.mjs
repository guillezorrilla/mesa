#!/usr/bin/env node
// Round trips from a Node phone to a paired Mac on each path (#1129): the broker's relay, then the
// Mac's own socket. Uses core's dist, as the app does: `pnpm --filter @mesa/core build` first.
//   node scripts/phone/path-latency.mjs join '<mesa://pair link>' <pairing.json>
//   node scripts/phone/path-latency.mjs measure <pairing.json> [trials]
// Then `mesa phone status` on the Mac confirms the pairing and starts its listener.
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  joinPairing,
  pairingClient,
  parsePairingLink,
  phoneKeys,
  phoneLine,
  webSocketConnect,
} from '../../packages/core/dist/phone/protocol/index.js';

const [mode, arg, file] = process.argv.slice(2);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (mode === 'join') {
  const link = parsePairingLink(arg);
  if (!link) throw new Error('not a pairing link');
  const pairing = await joinPairing(pairingClient(fetch, link.broker), link, new Date());
  writeFileSync(file, JSON.stringify(pairing));
  console.log(`joined ${pairing.pairingId}; now run mesa phone status on the Mac`);
  process.exit(0);
}
if (mode !== 'measure') throw new Error('mode: join or measure');

const pairing = JSON.parse(readFileSync(arg, 'utf8'));
const trials = Number(file ?? 20);
/** A dial to the Mac's own socket (any but the broker's) that never opens: the relay alone. */
const relayOnly = (url, on) => {
  if (url.includes('/pairings/')) return webSocketConnect(url, on);
  setTimeout(on.close, 0);
  return { send: () => {}, close: () => {} };
};
const median = (ms) => [...ms].sort((a, b) => a - b)[Math.floor(ms.length / 2)];

async function measure(connect) {
  const line = phoneLine(
    { connect, now: () => new Date(), wait, newId: randomUUID },
    { ...pairing, token: pairing.phoneToken, keys: phoneKeys(pairing) },
    { taken: (seq) => writeFileSync(arg, JSON.stringify({ ...pairing, takenSeq: seq })) },
  );
  line.connect();
  await line.call({ method: 'sessions' }); // the socket's own setup is not a round trip
  for (let i = 0; i < 30 && connect === webSocketConnect && line.path() === 'relay'; i += 1)
    await wait(100);
  const path = line.path();
  const ms = [];
  for (let i = 0; i < trials; i += 1) {
    const start = performance.now();
    await line.call({ method: 'sessions' });
    ms.push(Math.round(performance.now() - start));
  }
  line.close();
  console.log(`${path}: ${ms.join(' ')} ms`);
  return { path, median: median(ms), max: Math.max(...ms), trials };
}

const relay = await measure(relayOnly);
const direct = await measure(webSocketConnect);
console.log(JSON.stringify({ relay, direct }));
process.exit(0);
