import type { ReactNode } from 'react';
import { MacContext } from './macContext';
import { macOf, rememberMac } from './sessionMacs';
import { useMacs } from './useMacs';

/**
 * The Mac a screen talks to, from its route: `mac` (a push names its pairing), else the Mac its
 * `id` was seen on, else the first. A screen opened with both teaches the ones pushed from it.
 */
export function MacScope({
  params,
  children,
}: {
  params: { mac?: string; id?: string } | undefined;
  children: ReactNode;
}) {
  const macs = useMacs();
  if (params?.mac && params.id) rememberMac(params.mac, [params.id]);
  const id = params?.mac ?? macOf(params?.id);
  const link = (macs.find((mac) => mac.id === id) ?? macs[0])?.link;
  return <MacContext value={link}>{children}</MacContext>;
}
