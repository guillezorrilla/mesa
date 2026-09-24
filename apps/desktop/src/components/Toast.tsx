import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';

const ToastContext = createContext<(text: string) => void>(() => {});

/** Shows every message until it is dismissed; `useToast()` returns the function that adds one. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([]);
  const show = useCallback(
    (text: string) => setMessages((all) => [...all, { id: (all.at(-1)?.id ?? 0) + 1, text }]),
    [],
  );
  const dismiss = (id: number) => setMessages((all) => all.filter((m) => m.id !== id));
  return (
    <ToastContext value={show}>
      {children}
      <div className="toasts">
        {messages.map((m) => (
          <div key={m.id} role="alert" data-testid="toast" className="toast">
            <pre>{m.text}</pre>
            <button type="button" onClick={() => dismiss(m.id)}>
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export const useToast = () => useContext(ToastContext);
