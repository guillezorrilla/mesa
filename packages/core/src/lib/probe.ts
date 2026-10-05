import type { Runner } from './process.js';

// A binary probe: `<name> <version args>` with a timeout, as doctor shows each row.

export const CHECK_TIMEOUT_MS = 2000;

/** A binary Mesa needs, how to ask its version, and how to install it. */
export type Binary = {
  name: string;
  args: readonly string[];
  role: 'required' | 'agent';
  install: string;
};

/** The binary's Homebrew command, when it installs with one (Mesa can run it). */
export const homebrewInstall = (b: Binary) =>
  b.install.startsWith('brew ') ? b.install : undefined;

/** What a probe found: its version, or `hint`, why it failed and how to install it. */
export type Probe = { name: string; ok: boolean; version?: string; hint: string };

export const firstVersion = (text: string) => text.match(/\d+\.\d+[\w.-]*/)?.[0];

export async function probe(run: Runner, b: Binary): Promise<Probe> {
  const res = await run(b.name, [...b.args], CHECK_TIMEOUT_MS);
  if (res.ok) return { name: b.name, ok: true, version: firstVersion(res.stdout), hint: '' };
  const command = `\`${b.name} ${b.args.join(' ')}\``;
  const why = {
    missing: 'not found on PATH',
    timeout: `${command} did not answer within ${CHECK_TIMEOUT_MS / 1000} s`,
    failed: `${command} failed: ${res.detail}`,
  }[res.reason];
  const install = b.install.startsWith('https://')
    ? `see ${b.install} to install`
    : `install with \`${b.install}\``;
  return { name: b.name, ok: false, hint: `${why}; ${install}` };
}
