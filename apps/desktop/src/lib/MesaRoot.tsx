import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { ToastProvider } from '@/components/Toast';
import { type Bridge, type Client, createClient } from './client';
import { type FollowRoutes, routedBridge } from './followRoutes';
import type { Platform } from './platform';

const ClientContext = createContext<Client | null>(null);
const PlatformContext = createContext<Platform | null>(null);
const FollowRoutesContext = createContext<FollowRoutes | null>(null);

/**
 * Everything a screen needs around it: the mesa client over `bridge` (a chat action over its
 * session's open follow, followRoutes.ts), the OS `platform`, and the toasts. main.tsx passes the real bridge and platform; tests pass fakes.
 */
export function MesaRoot(props: { bridge: Bridge; platform: Platform; children: ReactNode }) {
  const routes = useMemo<FollowRoutes>(() => new Map(), []);
  const client = useMemo(
    () => createClient(routedBridge(props.bridge, routes)),
    [props.bridge, routes],
  );
  return (
    <ClientContext value={client}>
      <PlatformContext value={props.platform}>
        <FollowRoutesContext value={routes}>
          <ToastProvider>{props.children}</ToastProvider>
        </FollowRoutesContext>
      </PlatformContext>
    </ClientContext>
  );
}

function need<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} needs a MesaRoot above it`);
  return value;
}

export const useClient = (): Client => need(useContext(ClientContext), 'useClient');
export const usePlatform = (): Platform => need(useContext(PlatformContext), 'usePlatform');
export const useFollowRoutes = (): FollowRoutes =>
  need(useContext(FollowRoutesContext), 'useFollowRoutes');
