import type { CopyFormat, ErrorGroup, LogAsk, ServerLogEntry } from '@mesa/core';
import { useCallback, useMemo, useRef } from 'react';
import type { KeyedEntry } from '../shared/logLines';

/** What a row does: select it, filter by a request, and its hover actions Copy, Send and Mute. */
export type RowActions = {
  onToggle: (key: string) => void;
  onRequest: (id: string) => void;
  onMute: (pattern: string) => void;
  onCopy: (entry: KeyedEntry, format: CopyFormat) => void;
  onSendOne: (key: string) => void;
  /** Copies a group of identical errors as its summary (groupSummaryText). */
  onCopyGroup: (group: ErrorGroup<KeyedEntry>) => void;
  /** What Send does for this session: "Send to agent", or "Start a session with this line". */
  sendLabel: string;
};

/**
 * One stable RowActions object for the Logs panel's rows, so a poll re-renders only the rows that
 * changed: each action reads the latest `askAbout`, `mute` and `copy` through a ref.
 */
export function useRowActions(props: {
  takesPrompt: boolean;
  setPicked: (change: (now: ReadonlySet<string>) => ReadonlySet<string>) => void;
  setRequest: (id: string | undefined) => void;
  mute: (pattern: string) => void;
  askAbout: (asked: LogAsk, keys: ReadonlySet<string>) => boolean;
  /** Copies entries (useCopy). */
  copy: (entries: readonly ServerLogEntry[], format: CopyFormat) => void;
  copyGroup: (group: ErrorGroup<KeyedEntry>) => void;
}): RowActions {
  const latest = useRef(props);
  latest.current = props;
  const { setPicked, setRequest, takesPrompt } = props;
  const onMute = useCallback((pattern: string) => latest.current.mute(pattern), []);
  const onCopy = useCallback(
    (entry: KeyedEntry, format: CopyFormat) => latest.current.copy([entry], format),
    [],
  );
  const onCopyGroup = useCallback(
    (group: ErrorGroup<KeyedEntry>) => latest.current.copyGroup(group),
    [],
  );
  const onSendOne = useCallback(
    (key: string) => void latest.current.askAbout({ kind: 'send' }, new Set([key])),
    [],
  );
  return useMemo(
    () => ({
      onToggle: (key: string) =>
        setPicked((now) => {
          const next = new Set(now);
          if (!next.delete(key)) next.add(key);
          return next;
        }),
      onRequest: setRequest,
      onMute,
      onCopy,
      onSendOne,
      onCopyGroup,
      sendLabel: takesPrompt ? 'Send to agent' : 'Start a session with this line',
    }),
    [setPicked, setRequest, onMute, onCopy, onSendOne, onCopyGroup, takesPrompt],
  );
}
