/** The time source. Injected so log lines, notes, and receipts are reproducible in tests. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
