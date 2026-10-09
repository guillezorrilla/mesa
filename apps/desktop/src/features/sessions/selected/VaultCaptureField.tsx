import type { SessionRecord } from '@mesa/core';

/** A session's Vault capture as its record keeps it: running, the notes it saved, or why none. */
export function VaultCaptureField(props: { capture?: SessionRecord['capture'] }) {
  const { capture } = props;
  if (!capture) return <>None yet: a capture runs when the session ends</>;
  if (capture.state === 'running') return <>Running</>;
  if (capture.state === 'failed')
    return <span className="text-destructive">Failed: {capture.reason ?? 'no reason given'}</span>;
  const notes = capture.notes ?? [];
  if (!notes.length) return <>Nothing durable to save</>;
  return (
    <ul className="grid gap-1">
      {notes.map((note) => (
        <li key={note} className="break-all font-mono">
          {note}
        </li>
      ))}
    </ul>
  );
}
