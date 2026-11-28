// What Mesa fixes in gcloud itself (ADR-0033), each from its own fixed argv, never from error
// text. Pure, so the app names the same actions and command.

/**
 * What a failure's `action` asks for: `login` runs `gcloud auth login` (gcloudLogin), `enable`
 * turns on the Error Reporting API in the project (enableErrorReporting).
 */
export type GcloudAction = 'login' | 'enable';

/** The command that signs gcloud in, for Copy and a terminal session. */
export const LOGIN_COMMAND = 'gcloud auth login';
