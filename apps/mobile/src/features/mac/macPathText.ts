import type { MacPath } from '@mesa/core/phone';

/** How a path to the Mac reads on its card, and as VoiceOver says it (orca's mobile-connection-path-label). */
export function macPathText(path: MacPath): { label: string; spoken: string } {
  if (path === 'relay') return { label: 'Relay', spoken: "Through Mesa's relay" };
  const via = path === 'tailscale' ? 'Tailscale' : 'LAN';
  return { label: `Direct (${via})`, spoken: `Direct via ${via}` };
}
