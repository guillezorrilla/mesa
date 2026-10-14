import { ArrowRight, CircleCheck, TriangleAlert, X } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { Alert } from './ui/alert';
import { Button } from './ui/button';

/**
 * How a toast looks and lasts (ADR-0009 amendment): a confirmation is neutral, shows every time,
 * and goes by itself; an alert (a failure or a warning) is warm, shows once however often it
 * comes, and stays until dismissed. An alert from a read that repeats (a screen's refresh) stays
 * dismissed for the run; one from an action the person takes shows again each time it fails.
 */
type Tone = 'confirmation' | 'alert';
export type Message = { text: string; tone: Tone };
/** A link a toast may carry: following it goes somewhere else in the app, and dismisses the toast. */
type ToastLink = { label: string; onFollow: () => void };

/**
 * A confirmation; with the warning a recorded command's data carries (no receipt, a skill not
 * synced) after it, an alert, which stays, so a gap in the audit trail never goes unseen.
 */
export const said = (message: string, data?: { warning?: string }): Message =>
  data?.warning
    ? { text: `${message}; ${data.warning}`, tone: 'alert' }
    : { text: message, tone: 'confirmation' };

/**
 * No confirmation, only the warning a command's data carries, as an alert: for an action whose
 * result the screen already shows.
 */
export const warningOf = (data?: { warning?: string }): Message | undefined =>
  data?.warning ? { text: data.warning, tone: 'alert' } : undefined;

// ponytail: long enough to read one line; a setting if someone reads slower.
/** How long a confirmation stays. */
export const CONFIRMATION_MS = 4000;

/** `repeating`: the alert comes from a read that runs again by itself, not from a person's action. */
type Show = (
  text: string,
  tone?: Tone,
  link?: ToastLink,
  options?: { repeating?: boolean },
) => void;
const ToastContext = createContext<Show>(() => {});

/**
 * Shows toasts by their tone; `useToast()` returns the function that adds one, an alert unless
 * told, with a link when given.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<(Message & { id: number; link?: ToastLink })[]>([]);
  const last = useRef(0);
  // The alerts the person dismissed, so a screen that refreshes does not bring one back.
  const dismissed = useRef(new Set<string>());
  const dismiss = useCallback((m: Message & { id: number }) => {
    if (m.tone === 'alert') dismissed.current.add(m.text);
    setMessages((all) => all.filter((x) => x.id !== m.id));
  }, []);
  const show = useCallback<Show>(
    (text, tone = 'alert', link, options) => {
      const id = ++last.current;
      if (tone === 'confirmation') {
        setMessages((all) => [...all, { id, text, tone, link }]);
        setTimeout(() => dismiss({ id, text, tone }), CONFIRMATION_MS);
        return;
      }
      if (options?.repeating && dismissed.current.has(text)) return;
      // An alert already showing is not repeated: several screens can hit the same failure.
      setMessages((all) =>
        all.some((m) => m.tone === 'alert' && m.text === text)
          ? all
          : [...all, { id, text, tone, link }],
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
              {/* min-w-0 and wrapping anywhere: a long path never pushes Dismiss out of view. */}
              <div className="grid min-w-0 gap-1">
                <pre className="whitespace-pre-wrap font-mono text-xs [overflow-wrap:anywhere]">
                  {m.text}
                </pre>
                {m.link && (
                  <Button
                    variant="link"
                    size="xs"
                    data-testid="toast-link"
                    className="h-auto justify-self-start px-0 has-[>svg]:px-0"
                    onClick={() => {
                      m.link?.onFollow();
                      dismiss(m);
                    }}
                  >
                    {m.link.label}
                    <ArrowRight aria-hidden />
                  </Button>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                aria-label="Dismiss"
                onClick={() => dismiss(m)}
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
