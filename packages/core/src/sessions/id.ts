/** An 8-character Mesa session id; external input must never become a record path. */
export const SESSION_ID_PATTERN = /^[0-9a-z]{8}$/;
export const isSessionId = (id: string) => SESSION_ID_PATTERN.test(id);
