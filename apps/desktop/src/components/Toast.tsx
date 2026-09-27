import { CircleCheck, TriangleAlert, X } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * How a toast looks and lasts (ADR-0009 amendment): a confirmation is neutral, shows every time,
 * and goes by itself; an alert (a failure or a warning) is warm, shows once however often it
 * comes, and stays until dismissed.
 */
type Tone = 'confirmation' | 'alert';
export type Message = { text: string; tone: Tone };

/**
 * A confirmation; with the warning a recorded command's data carries (no receipt, a skill not
 * synced) after it, an alert, which stays, so a gap in the audit trail never goes unseen.
 */
export const said = (message: string, data?: { warning?: string }): Message =>
  data?.warning
    ? { text: `${message}; ${data.warning}`, tone: 'alert' }
    : { text: message, tone: 'confirmation' };

/** A command's own warning, if it has one, as an alert. */
export const warned = (warning: string | undefined): Message | undefined =>
  warning ? { text: warning, tone: 'alert' } : undefined;

// ponytail: long enough to read one line; a setting if someone reads slower.
/** How long a confirmation stays. */
export const CONFIRMATION_MS = 4000;

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => {});

/** Shows toasts by their tone; `useToast()` returns the function that adds one, an alert unless told. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<(Message & { id: number })[]>([]);
  const last = useRef(0);
  const dismiss = useCallback(
    (id: number) => setMessages((all) => all.filter((m) => m.id !== id)),
    [],
  );
  const show = useCallback(
    (text: string, tone: Tone = 'alert') => {
      const id = ++last.current;
      if (tone === 'confirmation') {
        setMessages((all) => [...all, { id, text, tone }]);
        setTimeout(() => dismiss(id), CONFIRMATION_MS);
        return;
      }
      // An alert already showing is not repeated: several screens can hit the same failure.
      setMessages((all) =>
        all.some((m) => m.tone === 'alert' && m.text === text) ? all : [...all, { id, text, tone }],
      );
    },
    [dismiss],
  );
  return (
    <ToastContext value={show}>
      {children}
      <div className="fixed right-4 bottom-4 z-50 flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-2">
        {messages.map((m) => (
          <Alert
            key={m.id}
            data-testid="toast"
            data-tone={m.tone}
            className="fade-in slide-in-from-bottom-2 animate-in shadow-lg"
          >
            {m.tone === 'alert' ? (
              <TriangleAlert className="text-state-waiting" />
            ) : (
              <CircleCheck className="text-muted-foreground" />
            )}
            <div className="flex items-start justify-between gap-2">
              <pre className="whitespace-pre-wrap break-words font-mono text-xs">{m.text}</pre>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                aria-label="Dismiss"
                onClick={() => dismiss(m.id)}
              >
                <X />
              </Button>
            </div>
          </Alert>
        ))}
      </div>
    </ToastContext>
  );
}

export const useToast = () => useContext(ToastContext);
