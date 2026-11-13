import type { PhoneDetail, PhoneStep } from '@mesa/core/phone';

/** What a working session's live line shows: the step it is on now, none when the Mac names none. */
export type Live = { step?: PhoneStep };

/**
 * A session's live line (#1153): none unless its state is working; then the step the Mac names
 * as current, found among the detail's steps, or none from an older Mac or between steps.
 */
export const liveOf = (detail: Pick<PhoneDetail, 'row' | 'steps' | 'current'>): Live | undefined =>
  detail.row.state === 'working'
    ? { step: detail.steps?.find((step) => step.id === detail.current) }
    : undefined;
