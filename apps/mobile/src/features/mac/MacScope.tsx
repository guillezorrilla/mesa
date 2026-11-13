import type { ReactNode } from 'react';
import { MacContext } from './macContext';
import { macFor } from './sessionMacs';
import { useMacs } from './useMacs';

/** The Mac a screen talks to, from its route (macFor), else the first. */
export function MacScope({
  params,
  children,
}: {
  params: { mac?: string; id?: string } | undefined;
  children: ReactNode;
}) {
  const macs = useMacs();
  const id = macFor(params);
  const link = (macs.find((mac) => mac.id === id) ?? macs[0])?.link;
  return <MacContext value={link}>{children}</MacContext>;
}
