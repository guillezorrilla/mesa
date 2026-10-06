import type { Runner } from '../../lib/process.js';
import { MesaError } from '../../lib/result.js';

/** A complete web address that is safe to hand to a browser. */
export function browserAddress(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new MesaError('usage', 'browser URL must be complete');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    Buffer.byteLength(url.href) > 2048
  )
    throw new MesaError(
      'usage',
      'browser URL must be http or https without credentials, under 2 KiB',
    );
  return url.href;
}

/** Opens a person-selected page in the macOS default browser, with argv rather than a shell. */
export async function openBrowserExternal(url: string, run: Runner) {
  const address = browserAddress(url);
  const result = await run('/usr/bin/open', [address], 5000);
  if (!result.ok) throw new MesaError('usage', `default browser did not open: ${result.detail}`);
  return { url: address, opened: true as const };
}
