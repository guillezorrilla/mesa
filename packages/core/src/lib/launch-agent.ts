import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { MesaContext } from '../context.js';
import { writeFileAtomic } from './atomic-file.js';
import { MesaError } from './result.js';

const xml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
const string = (value: string) => `<string>${xml(value)}</string>`;

/** One of Mesa's LaunchAgents: what it is called and runs, and how launchd keeps it going. */
export type AgentSpec = {
  /** The label's middle, `com.mesa.<name>.<profile>`. */
  name: string;
  /** What errors call it: `scheduler`, `phone listener`. */
  what: string;
  /** The mesa subcommand it runs, after `--profile <profile> --json`. */
  command: string[];
  /** Every `seconds` and at load, or kept running (restarted unless it exits cleanly). */
  run: { every: number } | 'keep-alive';
  /** Its logs, `<log>-stdout.log` and `<log>-stderr.log` in the profile root. */
  log: string;
};

/**
 * This profile's logged-in GUI LaunchAgent for `spec` (ADR-0016). MesaDeps.self owns the CLI
 * resolution.
 */
export function launchAgent(
  ctx: Pick<MesaContext, 'env' | 'home' | 'paths' | 'profile' | 'run' | 'self'>,
  spec: AgentSpec,
) {
  const label = `com.mesa.${spec.name}.${ctx.profile}`;
  const dir = join(ctx.home, 'Library/LaunchAgents');
  const plist = join(dir, `${label}.plist`);
  const domain = async () => {
    const uid = await ctx.run('/usr/bin/id', ['-u'], 5000);
    if (!uid.ok || !/^\d+$/.test(uid.stdout.trim()))
      throw new MesaError('internal', 'cannot resolve the logged-in user for launchd');
    return `gui/${uid.stdout.trim()}`;
  };
  /** Whether it is loaded, and the pid of its running process when one runs. */
  const status = async (): Promise<{
    label: string;
    plist: string;
    loaded: boolean;
    pid?: number;
  }> => {
    if (!existsSync(plist)) return { label, plist, loaded: false };
    const result = await ctx.run('/bin/launchctl', ['print', `${await domain()}/${label}`], 5000);
    const pid = result.ok ? /^\s*pid = (\d+)$/m.exec(result.stdout)?.[1] : undefined;
    return { label, plist, loaded: result.ok, ...(pid ? { pid: Number(pid) } : {}) };
  };
  /** The plist's ProgramArguments: this Mesa CLI's, then the subcommand. */
  const programArguments = () =>
    `<key>ProgramArguments</key><array>${[...ctx.self, '--profile', ctx.profile, '--json', ...spec.command].map(string).join('')}</array>`;
  return {
    status,
    exists: () => existsSync(plist),
    /** Whether the installed plist runs this very Mesa CLI (not another build's or worktree's). */
    runsThisCli: () => {
      try {
        return readFileSync(plist, 'utf8').includes(programArguments());
      } catch {
        return false;
      }
    },
    /**
     * Starts an installed agent that is not running (one that exited cleanly, or was unloaded);
     * a running one is left as it is.
     */
    start: async () => {
      const user = await domain();
      if (!(await status()).loaded)
        await ctx.run('/bin/launchctl', ['bootstrap', user, plist], 5000);
      await ctx.run('/bin/launchctl', ['kickstart', `${user}/${label}`], 5000);
      return status();
    },
    /** Kills a running agent and starts it again, on the executable its plist names now. */
    restart: async () => {
      await ctx.run('/bin/launchctl', ['kickstart', '-k', `${await domain()}/${label}`], 5000);
    },
    install: async () => {
      if (existsSync(plist))
        throw new MesaError(
          'usage',
          `${plist} already exists and is not owned by this ${spec.what}`,
        );
      if (!ctx.self.length || !isAbsolute(ctx.self[0] as string))
        throw new MesaError('usage', `${spec.what} needs an absolute Mesa CLI executable`);
      const env: Record<string, string> = {
        HOME: ctx.home,
        LANG: 'en_US.UTF-8',
        LC_CTYPE: 'en_US.UTF-8',
        PATH: ctx.env.PATH ?? '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
        MESA_SESSION_ID: '',
      };
      if (ctx.env.MESA_BROKER_URL) env.MESA_BROKER_URL = ctx.env.MESA_BROKER_URL;
      if (ctx.env.MESA_NOTIFICATION_HELPER) {
        if (!isAbsolute(ctx.env.MESA_NOTIFICATION_HELPER))
          throw new MesaError(
            'usage',
            'MESA_NOTIFICATION_HELPER must be an absolute bundled Mesa executable',
          );
        env.MESA_NOTIFICATION_HELPER = ctx.env.MESA_NOTIFICATION_HELPER;
      }
      const fields = [
        `<key>Label</key>${string(label)}`,
        programArguments(),
        `<key>WorkingDirectory</key>${string(ctx.paths.root)}`,
        `<key>EnvironmentVariables</key><dict>${Object.entries(env)
          .map(([k, v]) => `<key>${xml(k)}</key>${string(v)}`)
          .join('')}</dict>`,
        spec.run === 'keep-alive'
          ? '<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>RunAtLoad</key><true/>'
          : `<key>StartInterval</key><integer>${spec.run.every}</integer><key>RunAtLoad</key><true/>`,
        `<key>StandardOutPath</key>${string(join(ctx.paths.root, `${spec.log}-stdout.log`))}`,
        `<key>StandardErrorPath</key>${string(join(ctx.paths.root, `${spec.log}-stderr.log`))}`,
      ];
      mkdirSync(dir, { recursive: true });
      const user = await domain();
      writeFileAtomic(
        plist,
        `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>${fields.join('')}</dict></plist>\n`,
        0o600,
      );
      const result = await ctx.run('/bin/launchctl', ['bootstrap', user, plist], 5000);
      if (!result.ok) {
        rmSync(plist, { force: true });
        throw new MesaError('internal', `cannot install ${spec.what}: ${result.detail}`);
      }
      return status();
    },
    uninstall: async () => {
      const result = await ctx.run(
        '/bin/launchctl',
        ['bootout', `${await domain()}/${label}`],
        5000,
      );
      if (!result.ok && (await status()).loaded)
        throw new MesaError('internal', `cannot unload ${spec.what}: ${result.detail}`);
      rmSync(plist, { force: true });
      return { label, plist, loaded: false };
    },
  };
}
