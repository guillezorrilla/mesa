import { TriangleAlert, X } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const ToastContext = createContext<(text: string) => void>(() => {});

/** Shows each distinct message until it is dismissed; `useToast()` returns the function that adds one. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([]);
  const show = useCallback(
    // A message already showing is not repeated: several screens can hit the same failure.
    (text: string) =>
      setMessages((all) =>
        all.some((m) => m.text === text) ? all : [...all, { id: (all.at(-1)?.id ?? 0) + 1, text }],
      ),
    [],
  );
  const dismiss = (id: number) => setMessages((all) => all.filter((m) => m.id !== id));
  return (
    <ToastContext value={show}>
      {children}
      <div className="fixed right-4 bottom-4 z-50 flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-2">
        {messages.map((m) => (
          <Alert
            key={m.id}
            data-testid="toast"
            className="fade-in slide-in-from-bottom-2 animate-in shadow-lg"
          >
            <TriangleAlert className="text-state-waiting" />
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
