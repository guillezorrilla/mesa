import type { KeyProvider } from '@mesa/core';
import type { DecisionSite } from '@mesa/core/browser';
import type { ReactNode } from 'react';

/** The hosted decision models a person can add a key for. */
export type HostedModel = 'jev' | 'clef';

/** A link that opens in the browser. */
export const Link = (props: { href: string; children: ReactNode }) => (
  <a className="text-primary underline" href={props.href} target="_blank" rel="noopener noreferrer">
    {props.children}
  </a>
);

export const TYPESAFE_CONSOLE = 'https://console.typesafe.ai/keys';

/** What each model card says: what it improves, how to get its key, its price, where text goes. */
export const MODELS: Record<
  HostedModel,
  {
    label: string;
    provider: KeyProvider;
    /** What the password field holds. */
    keyLabel: string;
    sentence: string;
    steps: ReactNode[];
    price: string;
    privacy: string;
  }
> = {
  jev: {
    label: 'Jev',
    provider: 'typesafe',
    keyLabel: 'TypeSafe API key',
    sentence:
      "Sharper answers when Faro's rules are unsure: Jev, TypeSafe's decision model, gives calibrated probabilities.",
    steps: [
      <>
        Create an API key at <Link href={TYPESAFE_CONSOLE}>console.typesafe.ai/keys</Link>.
      </>,
      'Paste it below and choose Test and save.',
    ],
    price: 'Paid per input token: $0.042 per million.',
    privacy: 'The session text and the questions go to TypeSafe.',
  },
  clef: {
    label: 'CLEF',
    provider: 'cloudflare',
    keyLabel: 'Cloudflare API token',
    sentence:
      "Sharper answers when Faro's rules are unsure: CLEF, Cloudflare's decision model on Workers AI, gives calibrated probabilities.",
    steps: [
      <>
        Create an API token with Workers AI access at{' '}
        <Link href="https://dash.cloudflare.com/profile/api-tokens">
          dash.cloudflare.com/profile/api-tokens
        </Link>
        .
      </>,
      <>
        Copy your account ID from the overview at{' '}
        <Link href="https://dash.cloudflare.com/">dash.cloudflare.com</Link>.
      </>,
      'Paste both below and choose Test and save.',
    ],
    price: 'Free up to 10,000 Neurons a day, about 1.2M tokens on clef-flash.',
    privacy: 'The session text and the questions go to Cloudflare.',
  },
};

/** Each decision site as a card lists it. */
export const SITE_LABELS: Record<DecisionSite, string> = {
  supervision: 'Session state',
  relevance: 'Source relevance',
  'next-step': 'Next step',
  evidence: 'Completion evidence',
};
