// How long a reply landing on the Mac takes to reach a phone (#1128), and a call's round trip, on
// either path (#1129): a Node phone on the real request layer (core's dist: joinPairing,
// phoneLine) against a broker, `wrangler dev` for a test. Build core first (pnpm --filter @mesa/core build). Run from the repo root, with
// MESA_PROFILE a throwaway profile and MEASURE_DIR a scratch folder for its state:
//
//   node scripts/phone/reply-latency.mjs seed            plants a Claude session and its transcript
//   node scripts/phone/reply-latency.mjs join <link>     joins the pairing `mesa phone pair --json` gave
//   node scripts/phone/reply-latency.mjs poll|push|calls measures, with `mesa phone serve` running
//
// The phone talks to the Mac's own socket when the Mac offers one (ADR-0028); MEASURE_PATH=relay
// keeps it on the broker's relay. `calls` times TRIALS `sessions` round trips.
//
// The listener reads transcripts under CLAUDE_CONFIG_DIR=$MEASURE_DIR/claude. `poll` asks `session`
// every 5 s, as the session screen did before #1128; `push` sends `watch` and waits for the
// Mac's update. Each trial appends a reply to the transcript and its Stop hook event, then prints
// the milliseconds until the phone sees it; the last line is JSON with the median and max.
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const core = resolve(import.meta.dirname, '../../packages/core/dist');
const p = await import(join(core, 'phone/protocol/index.js'));
const t = await import(join(core, 'testing/index.js'));

const profile = process.env.MESA_PROFILE;
const dir = process.env.MEASURE_DIR;
if (!profile || profile === 'default' || !dir) {
  console.error('set MESA_PROFILE (a throwaway profile, not default) and MEASURE_DIR');
  process.exit(2);
}
const [mode, link] = process.argv.slice(2);
const file = (name) => join(dir, name);
const home = homedir();

if (mode === 'seed') {
  const cwd = file('proj');
  mkdirSync(cwd, { recursive: true });
  const agentSessionId = randomUUID();
  const session = t
    .testStore(home, profile, () => Math.random().toString(36).slice(2, 10).padEnd(8, 'a'))
    .create(() =>
      t.newSession({
        goal: 'Write the tide table docs',
        name: 'Tide docs',
        project: 'tide',
        agentSessionId,
        worktree: { path: cwd, branch: 'main' },
        tmux: { socket: `mesa-${profile}`, session: 'tide', window: 'claude-aaaaaa' },
      }),
    );
  const user = {
    type: 'user',
    sessionId: agentSessionId,
    cwd,
    message: { role: 'user', content: 'Write the docs' },
  };
  const transcript = t.plantTranscript(home, agentSessionId, cwd, `${JSON.stringify(user)}\n`, {
    CLAUDE_CONFIG_DIR: file('claude'),
  });
  writeFileSync(file('seed.json'), JSON.stringify({ id: session.id, transcript, cwd }));
  console.log(session.id);
  process.exit(0);
}

let pairing = existsSync(file('pairing.json'))
  ? JSON.parse(readFileSync(file('pairing.json'), 'utf8'))
  : undefined;
const save = () => writeFileSync(file('pairing.json'), JSON.stringify(pairing));
if (mode === 'join') {
  const parsed = p.parsePairingLink(link ?? '');
  if (!parsed) throw new Error('not a pairing link');
  pairing = await p.joinPairing(p.pairingClient(fetch, parsed.broker), parsed, new Date());
  save();
  process.exit(0);
}
if (!pairing || !['poll', 'push', 'calls'].includes(mode)) {
  console.error('usage: seed | join <link> | poll | push | calls (join first)');
  process.exit(2);
}

const seed = JSON.parse(readFileSync(file('seed.json'), 'utf8'));
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const newest = (detail) =>
  detail.replies.find((reply) => reply.from === 'agent')?.segments[0]?.text;
let seen;
/** With MEASURE_PATH=relay, a dial to the Mac's own socket (any but the broker's) never opens. */
const connect =
  process.env.MEASURE_PATH === 'relay'
    ? (url, on) => {
        if (url.includes('/pairings/')) return p.webSocketConnect(url, on);
        setTimeout(on.close, 0);
        return { send: () => {}, close: () => {} };
      }
    : p.webSocketConnect;
const line = p.phoneLine(
  { connect, now: () => new Date(), wait, newId: randomUUID },
  { ...pairing, token: pairing.phoneToken, keys: p.phoneKeys(pairing) },
  {
    message: (message) => {
      if (message.kind !== 'update') return;
      const detail = message.watched?.find((each) => each.id === seed.id)?.detail;
      if (detail) seen = newest(detail);
    },
    closed: () => setTimeout(() => line.connect(), 1000),
    taken: (seq) => {
      pairing.takenSeq = seq;
      save();
    },
  },
);
const calls = { call: line.call };
line.connect();

/** A reply lands as Claude Code writes one: the transcript line, then its Stop hook event. */
const land = (text) => {
  const line = {
    type: 'assistant',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    cwd: seed.cwd,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  };
  appendFileSync(seed.transcript, `${JSON.stringify(line)}\n`);
  t.plantHookEvent(
    home,
    { session: seed.id, agent: 'claude', at: line.timestamp, event: 'Stop', payload: {} },
    profile,
  );
};

const ask = () => calls.call({ method: 'session', id: seed.id, replies: 10 });
await ask();
// The Mac's answer to the phone's ask starts the direct dial; give it a moment to open.
for (let n = 0; n < 30 && process.env.MEASURE_PATH !== 'relay' && line.path() === 'relay'; n++)
  await wait(100);
const path = line.path();
if (mode === 'push') await calls.call({ method: 'watch', id: seed.id, replies: 10 });
const poll =
  mode === 'poll' &&
  setInterval(
    () =>
      ask().then(
        (detail) => (seen = newest(detail)),
        () => undefined,
      ),
    5000,
  );
const times = [];
for (let n = 1; n <= Number(process.env.TRIALS ?? 8); n++) {
  if (mode === 'calls') {
    const at = performance.now();
    await calls.call({ method: 'sessions' });
    times.push(Math.round(performance.now() - at));
    console.log(mode, path, n, times.at(-1), 'ms');
    continue;
  }
  await wait(1500 + Math.random() * 3000);
  const text = `${mode} reply ${n} ${Date.now()}`;
  const at = Date.now();
  land(text);
  while (seen !== text && Date.now() - at < 30_000) await wait(10);
  times.push(seen === text ? Date.now() - at : null);
  console.log(mode, path, n, times.at(-1), 'ms');
}
const got = times.filter((ms) => ms !== null).sort((a, b) => a - b);
console.log(
  JSON.stringify({
    mode,
    path,
    ms: times,
    median: got[Math.floor(got.length / 2)],
    max: got.at(-1),
  }),
);
if (mode === 'push') await calls.call({ method: 'unwatch', id: seed.id });
if (poll) clearInterval(poll);
line.close();
process.exit(0);
