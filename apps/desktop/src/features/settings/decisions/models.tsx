import type { KeyProvider } from '@mesa/core';
import type { DecisionSite, SystemOneProvider } from '@mesa/core/browser';
import { BrainCircuit, Cloud, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ExternalLink as Link } from '@/components/ExternalLink';

export const TYPESAFE_CONSOLE = 'https://console.typesafe.ai/keys';

/** The models as Settings lists them: CLEF first, for its free daily allowance. */
export const MODEL_ORDER = ['clef', 'jev'] as const satisfies readonly SystemOneProvider[];

/**
 * What each model's row and Connect dialog say: its name and maker, what its secret is called,
 * its cost in a few words and in full, where the text goes, and the help for each field.
 */
export const MODELS: Record<
  SystemOneProvider,
  {
    label: string;
    maker: string;
    icon: LucideIcon;
    provider: KeyProvider;
    /** What the secret is called: the field is "API <secret>". */
    secret: 'key' | 'token';
    sentence: string;
    /** The row's status line while not connected. */
    cost: string;
    price: string;
    privacy: string;
    keyHelp: ReactNode;
    /** CLEF's Cloudflare account ID field, which Jev has none of. */
    accountHelp?: ReactNode;
  }
> = {
  clef: {
    label: 'CLEF',
    maker: 'Cloudflare',
    icon: Cloud,
    provider: 'cloudflare',
    secret: 'token',
    sentence: "Cloudflare's decision model on Workers AI answers when Mesa's own rules are unsure.",
    cost: 'free daily allowance',
    price:
      'Free for about 1,000 decisions a day on any Cloudflare account; past that, Workers Paid charges about $0.24 per million tokens.',
    privacy: 'The session text and the questions go to Cloudflare.',
    accountHelp: (
      <>
        On the <Link href="https://dash.cloudflare.com/">Cloudflare dashboard</Link>: Workers AI
        &gt; Use REST API &gt; Account ID.
      </>
    ),
    keyHelp:
      'Create a Workers AI API token there and paste it; it is kept only in the macOS Keychain.',
  },
  jev: {
    label: 'Jev',
    maker: 'TypeSafe',
    icon: BrainCircuit,
    provider: 'typesafe',
    secret: 'key',
    sentence: "TypeSafe's decision model answers when Mesa's own rules are unsure.",
    cost: 'about $0.04 per million tokens',
    price: '$0.042 per million input tokens, billed by TypeSafe.',
    privacy: 'The session text and the questions go to TypeSafe.',
    keyHelp: (
      <>
        Create one at <Link href={TYPESAFE_CONSOLE}>console.typesafe.ai/keys</Link> and paste it; it
        is kept only in the macOS Keychain.
      </>
    ),
  },
};

/** Each decision site as a model's results list it. */
export const SITE_LABELS: Record<DecisionSite, string> = {
  supervision: 'Session state',
  relevance: 'Source relevance',
  'next-step': 'Next step',
  evidence: 'Completion evidence',
};
