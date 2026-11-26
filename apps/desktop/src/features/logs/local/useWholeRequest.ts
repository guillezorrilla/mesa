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
 * merged view, Send hands its message (requestMessage) to `deliver`, from the shown read when it
 * is that request's, else from a new one. Another project shows none.
 */
export function useWholeRequest(props: {
  project?: string;
  sources?: readonly LogSource[];
  deliver: (message: string) => boolean;
}) {
  const call = useCall();
  const toast = useToast();
  const [kept, setKept] = useState<ShownRequest & { project: string }>();
  const { project } = props;
  const shown = kept?.project === project ? kept : undefined;
  const listed = (id: string) => props.sources?.find((each) => each.id === id);
  /** A source as the panel names it ("Docker · harbour-api"), its id when not listed. */
  const label = (id: string) => {
    const source = listed(id);
    return source ? sourceLabel(source) : id;
  };
  /** A source's own name ("harbour-api"), its id when not listed. */
  const name = (id: string) => listed(id)?.name ?? id;
  const read = (id: string, from: string) => call('logs.request', { id, project: from });
  const show = async (id: string) => {
    if (!project) return;
    setKept({ id, project });
    const result = await read(id, project);
    setKept((now) =>
      now?.id !== id || now.project !== project
        ? now
        : result.ok
          ? { id, project, read: result.data }
          : { id, project, failure: result.error.message },
    );
  };
  const send = async (id: string) => {
    if (!project) return;
    let lines = shown?.id === id ? shown.read : undefined;
    if (!lines) {
      const result = await read(id, project);
      if (!result.ok) return toast(result.error.message);
      lines = result.data;
    }
    if (!lines.entries.length) return toast(`No lines name request ${id}`);
    props.deliver(
      requestMessage({ id, entries: lines.entries, label, time: (entry) => clockTime(entry.time) }),
    );
  };
  return { shown, show, send, close: () => setKept(undefined), label, name };
}
