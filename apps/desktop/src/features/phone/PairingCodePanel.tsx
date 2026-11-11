import type { PairingCode } from './usePhonePairing';

const clock = (at: string) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** The pairing QR the phone scans, and when it stops working. */
export function PairingCodePanel({ code }: { code: PairingCode }) {
  return (
    <figure className="flex flex-col items-center gap-2">
      <img
        alt="Pairing QR code"
        className="size-56 rounded-md bg-white p-2"
        src={`data:image/svg+xml;utf8,${encodeURIComponent(code.svg)}`}
      />
      <figcaption className="text-xs text-muted-foreground">
        Expires at {clock(code.expiresAt)}
      </figcaption>
    </figure>
  );
}
