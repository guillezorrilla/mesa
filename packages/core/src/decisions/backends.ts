/**
 * Where Faro sends a decision: its rules (ADR-0020), or the hosted model the profile chose,
 * asked when the rules are unsure (ADR-0019, #488).
 */
export const DECISIONS_BACKENDS = ['rules', 'jev', 'clef'] as const;

/** What `decisions.model` names: Jev, CLEF, or none (the rules alone, the default). */
export const DECISIONS_MODELS = ['jev', 'clef', 'none'] as const;
