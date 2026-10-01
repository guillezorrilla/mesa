/** Where Faro sends a decision: deterministic rules first, or the `claude -p` adapter. */
export const DECISIONS_BACKENDS = ['rules', 'adapter'] as const;
