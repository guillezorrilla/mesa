import type { LogSource, RequestLines } from '@mesa/core';
import { requestMessage, sourceLabel } from '@mesa/core/browser';
import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { useCall } from '@/lib/useCommand';
import { clockTime } from '../shared/logLines';

/** A request shown across the project's sources: reading, read, or failed. */
export type ShownRequest = { id: string; read?: RequestLines; failure?: string };

/**
 * A whole request across the project's sources (CONTEXT.md, Logs panel): Show reads it into the
 * merged view, Send reads it and hands its message (requestMessage) to `deliver`.
 */
export function useWholeRequest(props: {
  project?: string;
  sources?: readonly LogSource[];
  deliver: (message: string) => boolean;
}) {
  const call = useCall();
  const toast = useToast();
  const [shown, setShown] = useState<ShownRequest>();
  const listed = (id: string) => props.sources?.find((each) => each.id === id);
  /** A source as the panel names it ("Docker · harbour-api"), its id when not listed. */
  const label = (id: string) => {
    const source = listed(id);
    return source ? sourceLabel(source) : id;
  };
  /** A source's own name ("harbour-api"), its id when not listed. */
  const name = (id: string) => listed(id)?.name ?? id;
  const read = (id: string, project: string) => call('logs.request', { id, project });
  const show = async (id: string) => {
    const { project } = props;
    if (!project) return;
    setShown({ id });
    const result = await read(id, project);
    setShown((now) =>
      now?.id !== id
        ? now
        : result.ok
          ? { id, read: result.data }
          : { id, failure: result.error.message },
    );
  };
  const send = async (id: string) => {
    const { project } = props;
    if (!project) return;
    const result = await read(id, project);
    if (!result.ok) return toast(result.error.message);
    if (!result.data.entries.length) return toast(`No lines name request ${id}`);
    props.deliver(
      requestMessage({
        id,
        entries: result.data.entries,
        label,
        time: (entry) => clockTime(entry.time),
      }),
    );
  };
  return { shown, show, send, close: () => setShown(undefined), label, name };
}
