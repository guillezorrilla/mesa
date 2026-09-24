import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { ToastProvider } from '../components/Toast';
import { type Bridge, type Client, createClient } from './client';

const ClientContext = createContext<Client | null>(null);

/** Everything a screen needs around it, over one bridge: main.tsx passes the real one, tests a fake. */
export function MesaRoot({ bridge, children }: { bridge: Bridge; children: ReactNode }) {
  const client = useMemo(() => createClient(bridge), [bridge]);
  return (
    <ClientContext value={client}>
      <ToastProvider>{children}</ToastProvider>
    </ClientContext>
  );
}

export function useClient(): Client {
  const client = useContext(ClientContext);
  if (!client) throw new Error('useClient needs a MesaRoot above it');
  return client;
}
