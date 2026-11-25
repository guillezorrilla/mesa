import type { Http } from '../lib/http.js';
import type { Runner, RunResult } from '../lib/process.js';
import { MesaError } from '../lib/result.js';

// The person's own `gcloud` (ADR-0033), the one way Cloud Logs reaches Google: its calls as an
// argv, what a failure means, a read in every GCP project at once, and a REST call made with the
// access token `gcloud` prints, which is never stored.

/** A gcloud call takes about 1 to 7 s (ADR-0033); this is room for a slow network. */
export const GCLOUD_TIMEOUT_MS = 30_000;
const INSTALL_URL = 'https://cloud.google.com/sdk/docs/install';

/** A GCP project that could not be read, while the others were, with the fix when one is known. */
export type CloudWarning = { project: string; message: string; fix?: string };

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
      { reason: 'permission_denied', fix: 'gcloud auth login' },
    );
  // Google's own denial codes first: their text can mention credentials too.
  if (/PERMISSION_DENIED|USER_PROJECT_DENIED/.test(said)) return denied();
  if (/active account|auth login|reauthenticat|refresh.*tokens|credentials/i.test(said))
    return new MesaError(
      'invalid_config',
      'gcloud has no signed-in account: run gcloud auth login',
      {
        reason: 'signed_out',
        fix: 'gcloud auth login',
      },
    );
  if (/not found or deleted|permission/i.test(said)) return denied();
  return new MesaError('internal', `gcloud failed: ${said.trim().split('\n')[0]}`);
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
      const fix = (error as MesaError).details as { fix?: string } | undefined;
      warnings.push({
        project,
        message: error instanceof Error ? error.message : String(error),
        ...(fix?.fix ? { fix: fix.fix } : {}),
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
