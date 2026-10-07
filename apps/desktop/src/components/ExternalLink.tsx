import type { ReactNode } from 'react';

/** A link that opens in the browser. */
export function ExternalLink(props: { href: string; children: ReactNode }) {
  return (
    <a
      className="text-primary underline"
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {props.children}
    </a>
  );
}
