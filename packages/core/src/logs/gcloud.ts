import type { Http } from '../lib/http.js';
import type { Runner, RunResult } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { type GcloudAction, LOGIN_COMMAND } from './gcloud-actions.js';

// The person's own `gcloud` (ADR-0033), the one way Cloud Logs reaches Google: its calls as an
// argv, what a failure means, a read in every GCP project at once, and a REST call made with the
// access token `gcloud` prints, which is never stored.

/** A gcloud call takes about 1 to 7 s (ADR-0033); this is room for a slow network. */
export const GCLOUD_TIMEOUT_MS = 30_000;
const INSTALL_URL = 'https://cloud.google.com/sdk/docs/install';

/** A GCP project that could not be read, while the others were, with the fix when one is known. */
export type CloudWarning = {
  project: string;
  message: string;
  fix?: string;
  action?: GcloudAction;
};

/** gcloud's own words for a failure: its first ERROR line without the command it names. */
const gcloudWords = (said: string) =>
  (said.split('\n').find((line) => line.startsWith('ERROR')) ?? said.trim().split('\n')[0] ?? '')
    .replace(/^ERROR:\s*(\([\w.-]+\)\s*)?/, '')
    .trim();

/**
 * Why gcloud could not act for the person, as gcloud said it (ADR-0033): Google asks to sign in
 * again (reauthentication, which a call with no terminal cannot answer), the sign-in could not be
 * refreshed, or no account is signed in; undefined for any other failure.
 */
function signInProblem(said: string) {
  if (/reauthenticat/i.test(said))
    return {
      reason: 'reauth',
      message:
        'Google asks you to sign in to gcloud again, which a read in the background cannot answer: sign in to Google Cloud',
    };
  if (/problem refreshing|invalid_grant|refresh.*token/i.test(said))
    return {
      reason: 'refresh_failed',
      message: `gcloud could not refresh its sign-in (${gcloudWords(said)}): sign in to Google Cloud again`,
    };
  if (/active account|credentialed accounts|auth login|credentials/i.test(said))
    return {
      reason: 'signed_out',
      message: 'gcloud has no signed-in account: sign in to Google Cloud',
    };
}

/** What a failed gcloud call means, with its fix: missing gcloud, no signed-in account, no access. */
export function gcloudError(read: Extract<RunResult, { ok: false }>, project: string): MesaError {
  if (read.reason === 'missing')
    return new MesaError(
      'not_found',
      `gcloud is not installed: install the Google Cloud CLI (${INSTALL_URL}), then run gcloud auth login`,
      { reason: 'gcloud_missing', fix: INSTALL_URL },
    );
  if (read.reason === 'timeout')
    return new MesaError(
      'timeout',
      `gcloud took over ${GCLOUD_TIMEOUT_MS / 1000} s; try a shorter time range`,
    );
  const said = read.output || read.detail;
  const denied = () =>
    new MesaError(
      'invalid_config',
      `the signed-in gcloud account cannot read the logs of ${project}: run gcloud auth login with an account that has Logs Viewer on it, or fix logs.gcp.projects`,
      { reason: 'permission_denied', fix: LOGIN_COMMAND, action: 'login' },
    );
  // Google's own denial codes first: their text can mention credentials too.
  if (/PERMISSION_DENIED|USER_PROJECT_DENIED/.test(said)) return denied();
  const signIn = signInProblem(said);
  if (signIn)
    return new MesaError('invalid_config', signIn.message, {
      reason: signIn.reason,
      fix: LOGIN_COMMAND,
      action: 'login',
    });
  if (/not found or deleted|permission/i.test(said)) return denied();
  return new MesaError('internal', `gcloud failed: ${gcloudWords(said)}`);
}

/** `gcloud <args>` for `project`: its stdout, or a gcloudError. */
export async function gcloud(run: Runner, project: string, args: string[]) {
  const read = await run('gcloud', args, GCLOUD_TIMEOUT_MS);
  if (!read.ok) throw gcloudError(read, project);
  return read.stdout;
}

/** gcloud's JSON list; a typed error for output that is none. */
export function jsonList(out: string): Record<string, unknown>[] {
  let raw: unknown;
  try {
    raw = out.trim() ? JSON.parse(out) : [];
  } catch {
    raw = undefined;
  }
  if (!Array.isArray(raw)) throw new MesaError('internal', 'gcloud printed no JSON list');
  return raw;
}

/**
 * `read` in each of `projects` at once: what each gave, and a warning, with its fix, for each that
 * failed; the first failure itself when every one did.
 */
export async function eachProject<T>(
  projects: readonly string[],
  read: (project: string) => Promise<T>,
) {
  const settled = await Promise.allSettled(projects.map(read));
  const done: { project: string; value: T }[] = [];
  const warnings: CloudWarning[] = [];
  settled.forEach((result, i) => {
    const project = projects[i] as string;
    if (result.status === 'fulfilled') done.push({ project, value: result.value });
    else {
      const error = result.reason;
      const details = (error as MesaError).details as
        | { fix?: string; action?: GcloudAction }
        | undefined;
      warnings.push({
        project,
        message: error instanceof Error ? error.message : String(error),
        ...(details?.fix ? { fix: details.fix } : {}),
        ...(details?.action ? { action: details.action } : {}),
      });
    }
  });
  if (!done.length && settled[0]?.status === 'rejected') throw settled[0].reason;
  return { done, warnings };
}

/** A short-lived access token for Google's REST APIs, as `gcloud auth print-access-token` prints it. */
export const accessToken = async (run: Runner) =>
  (await gcloud(run, 'any project', ['auth', 'print-access-token'])).trim();

/**
 * A Google REST API's JSON answer, called with `token` (accessToken), or a fresh one; never
 * stored past the call that asked for it.
 */
export async function googleGet(
  run: Runner,
  http: Http,
  project: string,
  url: string,
  token?: string,
) {
  const bearer = token ?? (await accessToken(run));
  const response = await http(url, { headers: { Authorization: `Bearer ${bearer}` } });
  if (!response.ok)
    throw new MesaError(
      response.status === 403 ? 'invalid_config' : 'internal',
      `${new URL(url).hostname} answered HTTP ${response.status} for ${project}`,
      { status: response.status },
    );
  return (await response.json()) as Record<string, unknown>;
}

/** Whether `error` is gcloud's sign-in failure, which signing in again fixes. */
export const needsSignIn = (error: unknown) =>
  ((error as MesaError | undefined)?.details as { action?: GcloudAction } | undefined)?.action ===
  'login';

/** How long `gcloud auth login` waits for the person to finish in the browser. */
export const LOGIN_TIMEOUT_MS = 180_000;

/**
 * `gcloud auth login`, Mesa's fixed argv: gcloud opens the browser and waits for the person, who
 * signs in (or answers Google's reauthentication); it ends by itself past LOGIN_TIMEOUT_MS.
 */
export async function gcloudLogin(run: Runner) {
  const done = await run('gcloud', ['auth', 'login'], LOGIN_TIMEOUT_MS);
  if (done.ok) return;
  if (done.reason === 'missing') throw gcloudError(done, '');
  if (done.reason === 'timeout')
    throw new MesaError(
      'timeout',
      `the sign-in was not finished in the browser within ${LOGIN_TIMEOUT_MS / 60_000} minutes`,
      { fix: LOGIN_COMMAND },
    );
  throw new MesaError(
    'internal',
    `gcloud auth login failed: ${gcloudWords(done.output || done.detail)}`,
    { fix: LOGIN_COMMAND },
  );
}

/** Turns on the Error Reporting API in GCP `project`, a change to that project. */
export const enableErrorReporting = (run: Runner, project: string) =>
  gcloud(run, project, [
    'services',
    'enable',
    'clouderrorreporting.googleapis.com',
    '--project',
    project,
  ]);
