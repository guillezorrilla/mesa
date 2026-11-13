# ADR-0028: The phone talks to the Mac directly on its network, and through the relay elsewhere

Status: accepted
Date: 2026-11-13

## Context

Issue #1129, epic #902. The owner wants the phone and the Mac "same as orca please, I like the wifi idea but I want to work when in different networks": orca's phone dials the desktop's own server on the same Wi-Fi or over Tailscale and falls back to its relay, end-to-end encrypted either way. Until now both Mesa sides dialed out to the Pairing's Durable Object and no port opened on the Mac (ADR-0014's 2026-11-11 amendment), so every call made two trips through Cloudflare even with the phone on the Mac's own desk. Opening a socket on the Mac reverses part of that amendment, so it is recorded here. The owner asked to follow orca and to name every difference from it.

## Decision

**The Phone listener also takes the phone on a socket of its own.** `mesa phone serve` starts a WebSocket server (`ws`, `phone/serve/direct-socket.ts`) on every interface (`::`, which on macOS takes IPv4 too) at a free port the system picks, and admits only peers from loopback, the private ranges (10/8, 172.16/12, 192.168/16, 169.254/16, fc00::/7, fe80::/10) and Tailscale's (100.64/10); any other peer is cut at once (orca's `network-source-class.ts`). A frame is at most 16 KB, twice a box. It speaks the broker's own frames, so `mailbox.ts` carries both paths: one seq count, one seal, one part joiner.

**Which addresses it offers.** Its IPv4 addresses that are not internal, link-local or a proxy's fake range (198.18/15), Tailscale's first, then the LAN's (orca's `pairing-network-interfaces.ts` ranking), at most 8 (`phone/serve/direct-hosts.ts`).

**How the phone learns them: sealed, over the relay.** A new message, `direct` (`protocol/direct.ts`): the phone's `{kind: 'direct'}` asks, and the Mac answers on the path it was asked on with `{kind: 'direct', port, hosts}`, or with neither when it has no socket. Both are sealed boxes like every other message, so the addresses never travel in plain text and the broker cannot read them. The phone asks each time its line opens and whenever it falls back to the relay; it keeps the answer in memory only.

**How the socket authenticates: the pairing's keys.** The phone's first frame on the socket is `{t: "auth", box}`, the `direct` ask sealed with the pairing's phone-to-Mac key and a fresh seq. The Mac takes it as any box (it must open, and its seq must not have been taken), answers `{t: "ready"}`, and only then reads or sends boxes on that socket. A stranger on the same network can open the TCP connection but cannot seal a box, and a hello replayed from the air carries a seq already taken: either gets the socket closed and nothing else. The sealed hello stands in for the token #1129 names: the broker's tokens never travel on the socket, so nothing on it is worth sniffing. A second authenticated socket replaces the first.

**One seq count across two paths: taken once, reordered within 10 s.** A box is refused when its seq was taken already, or is at or under a floor that follows the newest seq taken less 10 s of the sender's clock (`protocol/taken.ts`). So a box both paths deliver is applied once, and a box the relay held while a later one came directly is still taken, where the strict rising seq of ADR-0014 would have dropped it. After a restart the floor is the last seq kept, as before.

**Which path a box takes.** The phone keeps its relay socket open and sends on the direct socket whenever it is open. The Mac answers on the path the phone last spoke on (the phone listens on both, so an answer on either arrives): direct while the phone talks there, the relay once a box of the phone's comes by the relay, which the phone's fallback ask guarantees, so a direct socket the Mac thinks open but the phone left (a Wi-Fi gone with no close) stops taking the Mac's boxes as soon as the phone is heard on the relay.

**How the phone picks and switches (`protocol/direct-path.ts`, after orca's `mobile-endpoint-supervisor.ts`).** Given addresses, the phone dials all of them at once; the first to open carries the hello, the rest close. Right after its line opens, its sends wait for that dial up to 1 s (`HEAD_START_MS`), then go by the relay; a later dial holds no send. When the direct socket closes, or a call on it gets no answer in its 10 s (a socket dead with no close), the phone drops it, asks over the relay at once, and stays on the relay for 60 s (`RETRY_MS`) before asking and dialing again. A call in flight during a switch is answered on whichever path the Mac then uses, or fails after its 10 s as `timeout`, never silently: reads are asked once more (`againOnTimeout`), now by the relay.

**One line on the phone.** `phoneLine` (`protocol/line.ts`) is the mailbox, the calls and the path choice together; the app's `macLink` and the tests run the same one. Settings shows each paired Mac's path on its card: Direct (LAN), Direct (Tailscale) or Relay (orca's `mobile-connection-path-label.ts`).

**What the person sees once.** iOS asks "Allow Mesa to find and connect to devices on your local network?" the first time the phone dials a LAN address, with `NSLocalNetworkUsageDescription` ("Mesa talks to your Mac directly when both are on the same network, which is faster than going through the internet."); declining leaves it on the relay. A Tailscale address needs no such permission. The app allows plain `ws://` to local and tailnet addresses (`NSAllowsLocalNetworking`); every box on it is sealed anyway. On the Mac, the application firewall, when on (it is off by default), asks once whether `mesa` (or `node` when run from source) may accept incoming connections; declining leaves the phone on the relay. Both changes to the app's Info.plist make a TestFlight build, not an update over the air.

## Differences from orca

Read on 2026-11-13 at github.com/stablyai/orca, commit 1cd89ab (MIT):

- **The relay is the first path, the direct one learned over it** (orca: `mobile/src/pairing/pairing.ts`, `src/main/runtime/rpc/server/runtime-rpc-mobile-pairing.ts`). orca's QR carries the desktop's direct endpoint and the phone learns the relay over the direct channel (`relay/mobile-relay-direct-upgrade.ts`); Mesa's QR carries the broker (ADR-0014) and the Mac's addresses come sealed over the relay, so a phone that never shares a network with its Mac pairs and works the same.
- **Both paths stay open on the phone** (orca: `connection/stable-logical-rpc-client.ts`'s `migrateTo` closes the old session). Mesa keeps the relay socket, which costs nothing idle (hibernation): fallback is a send on a socket already open, not a dial, and a box the Mac already left in the mailbox still arrives.
- **One sealed box format on both paths, no handshake of its own** (orca: `transport/encryption/` and its E2EE v2 latch). Mesa's boxes already carry their seal and seq (ADR-0027), so the direct socket authenticates with a sealed hello and needs no session keys or token of its own.
- **A reorder window on seqs** (orca has per-session counters on each physical channel). Mesa's one count spans both paths, so a 10 s window replaces ADR-0014's strictly rising seq.
- **Head start 1 s, not 2.5 s** (orca: `relay/mobile-relay-direct-grace-timer.ts`'s `DIRECT_DIAL_GRACE_MS`), as #1129 asks; nothing is lost by it, since the relay is already open.
- **One success to switch back, after 60 s** (orca: `connection/mobile-endpoint-hysteresis.ts`, three successful probes over 30 s and a 60 s dwell; `relay/mobile-direct-return-probe.ts` every 15 s). Mesa keeps the 60 s (orca's dwell and failure cooldown) and dials once after it: each orca probe is a full session, while a Mesa probe consumes seqs and boxes, and a flapping direct path costs a Mesa phone at most one call's 10 s.
- **No network-change nudge and no remembered last good path** (orca: `connection/mobile-endpoint-nudge-router.ts`, `connection/host-path-memory.ts`). Those need a native network monitor; the phone asks again each time its line opens, which is when it comes to the front.
- **IPv4 addresses only, every one offered, the phone races them** (orca: `pairing-network-interfaces.ts` lists IPv6 too and `selectAutoAdvertisedPairingAddress` picks one for the QR). An IPv6 address needs brackets and a scope the phone does not have; add them if an IPv6-only network ever matters.
- **No `serve` for remote hosts or SSH, no Bonjour** (orca: `src/cli/specs/serve.ts`); out of scope in #1129.

## Evidence

- orca read 2026-11-13 at commit 1cd89ab: `mobile/src/transport/connection/mobile-endpoint-supervisor.ts`, `mobile-endpoint-hysteresis.ts`, `mobile-connection-path-label.ts`, `stable-logical-rpc-client.ts`, `mobile/src/transport/relay/mobile-direct-return-probe.ts`, `mobile-relay-direct-grace-timer.ts`, `mobile-direct-endpoint-probe.ts`, `mobile-relay-direct-upgrade.ts`, `src/main/runtime/rpc/transports/websocket/source-admission/network-source-class.ts`, `src/main/runtime/rpc/server/runtime-rpc-network-exposure.ts`, `pairing/network/pairing-network-interfaces.ts`, `src/shared/remote-runtime/pairing/remote-pairing-address.ts`.
- Measured 2026-11-13 with `scripts/phone/reply-latency.mjs` (#1128's, given `MEASURE_PATH=relay` and a `calls` mode here): a Node phone paired to a throwaway profile whose listener ran against `wrangler dev` on the same Mac (load average about 180). 20 `sessions` round trips: relay median 3 ms, max 214 ms (the first); direct (LAN) median 1 ms, max 2 ms. 8 replies landing on the Mac until the phone had them (`push`): relay median 228 ms, max 251 ms; direct median 218 ms, max 236 ms, most of it the listener's own look after the file event. An earlier run of 20 calls under heavier load: relay median 59 ms, max 169 ms; direct median 1 ms, max 4 ms. `wrangler dev` runs on the Mac itself, so these relay numbers carry no internet round trip; a deployed relay adds two to Cloudflare per call, which the direct path never pays. No Tailscale on the measuring Mac, so the tailnet path is covered by tests only.
- Expo's own development builds set `NSAllowsLocalNetworking` and an `NSLocalNetworkUsageDescription` for the same reason (expo/expo `apps/bare-expo/ios/BareExpo/Info.plist`, `expo-dev-launcher`'s `withDevLauncher.ts`).

## Consequences

- On the Mac's network a call is answered in a millisecond or two plus the Mac's own work, against tens to hundreds of milliseconds through the relay.
- The Mac now listens on a port. Only peers on its own networks are admitted, and only the paired phone gets past the first frame, but a firewall prompt may appear once.
- `ws` (MIT, no dependencies) is a new runtime dependency of core; the CLI's bundle carries it.
- A Mac or phone built before this ignores `direct` messages and stays on the relay.
