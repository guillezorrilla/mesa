#!/usr/bin/env node
// The CLI entrypoint: the only place that reads process globals or picks the real implementations;
// createMesa (the composition root) wires them.
import { readFileSync, writeSync } from 'node:fs';
import { uptime } from 'node:os';

const argv = process.argv.slice(2);
// An agent hook outside a Mesa session exits before anything else loads (#22: within 50 ms).
// `mesa hook tmux`, typed without --profile first, is tmux's, which never has a session id.
if (argv[0] === 'hook' && argv[1] !== 'tmux' && !process.env.MESA_SESSION_ID) process.exit(0);

/** All of stdin, read once: a hook's payload, which a forwarded call and its fallback share. */
let stdinText: Promise<string> | undefined;
const readStdin = () => {
  stdinText ??= (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  })();
  return stdinText;
};

/**
 * The call on the app's Command server, when one of this version answers on the profile's socket
 * (ADR-0032), so this process never loads core; undefined to run it here. Node builtins only.
 */
async function forwarded() {
  const [{ parseArgs }, { homedir }, { profilePaths, resolveProfileName }, socket, flags, ver] =
    await Promise.all([
      import('node:util'),
      import('node:os'),
      import('@mesa/core/paths'),
      import('./command-socket.js'),
      import('./command.js'),
      import('./version.js'),
    ]);
  const { values, positionals } = parseArgs({
    args: argv,
    options: flags.GLOBAL_FLAGS,
    allowPositionals: true,
    strict: false,
  });
  const profile = resolveProfileName(
    typeof values.profile === 'string' ? values.profile : undefined,
    process.env,
  );
  const hook = positionals[0] === 'hook';
  const out = await socket.forwardCall(
    profilePaths(homedir(), profile).commandSocket,
    process.getuid?.() ?? -1,
    {
      version: ver.VERSION,
      build: ver.BUILD,
      argv,
      cwd: process.cwd(),
      env: process.env,
      startedAt: performance.timeOrigin,
    },
    readStdin,
    // A server that does not take the call in 2 s is stalled: it runs here. A hook holds up its
    // agent's turn, so its reply gets 5 s; any other call may rightly take long (a guardrail's
    // check, a model's advice), and one that waits runs here anyway (Command.ownProcess).
    hook ? { readyMs: 2000, replyMs: 5000 } : { readyMs: 2000 },
  );
  if (out !== 'lost') return out;
  // A hook's event must reach Mesa, and one recorded twice is harmless; anything else may have
  // acted, so it is not run again.
  if (hook) return undefined;
  return {
    code: 1,
    stdout: '',
    stderr: "mesa: the app's Command server ended before it answered; the call may have run\n",
  };
}

/** The call run in this process, over all of core: what every call did before ADR-0032. */
async function runHere() {
  const [
    { randomBytes, randomUUID },
    { homedir },
    { join },
    sea,
    { setTimeout: sleep },
    { fileURLToPath },
  ] = await Promise.all([
    import('node:crypto'),
    import('node:os'),
    import('node:path'),
    import('node:sea'),
    import('node:timers/promises'),
    import('node:url'),
  ]);
  const {
    envRunner,
    envSpawner,
    keychainStore,
    loopbackListener,
    macObsidianPaths,
    profilesDir,
    systemClock,
    ulidSource,
    webSocketConnect,
    wsDirectListen,
  } = await import('@mesa/core');
  const { runCli } = await import('./cli.js');
  const { VERSION } = await import('./version.js');
  const { unpackSkills } = await import('./bundled-skills.js');
  const { COMMANDS } = await import('./commands/index.js');
  const { terminalConfirm } = await import('./confirm.js');
  const { terminalSecret } = await import('./ask-secret.js');
  const { browserSelection } = await import('./browser-selection.js');

  const home = homedir();
  const run = envRunner(process.env);
  // Inside the app, mesa is one executable (ADR-0017) that carries its skill library as assets.
  const bundled = sea.isSea();
  return runCli(argv, {
    commands: COMMANDS,
    env: process.env,
    tty: Boolean(process.stdin.isTTY),
    forEnv: (env, cwd) => ({ run: envRunner(env, cwd), spawn: envSpawner(env, cwd) }),
    stdin: readStdin,
    // Only a terminal has a person to ask.
    ...(process.stdin.isTTY
      ? {
          confirm: terminalConfirm(process.stdin, process.stderr),
          askSecret: terminalSecret(process.stdin, process.stderr),
        }
      : {}),
    mesa: {
      home,
      cwd: process.cwd(),
      clock: systemClock,
      newId: ulidSource(systemClock, randomBytes),
      newUuid: randomUUID,
      sleep: async (ms) => {
        await sleep(ms);
      },
      // This node and this script (or the one executable), so hooks run the same mesa whatever the
      // hook's PATH holds.
      self: bundled ? [process.execPath] : [process.execPath, fileURLToPath(import.meta.url)],
      env: process.env,
      run,
      spawn: envSpawner(process.env),
      http: (url, init) => fetch(url, init),
      connect: webSocketConnect,
      listenDirect: wsDirectListen,
      // A person gets five minutes to sign in to a source.
      listen: loopbackListener(5 * 60_000),
      secretStore: keychainStore(run),
      processAlive: (pid) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch (error) {
          // EPERM: the process exists under another user; only a missing one is dead.
          return (error as NodeJS.ErrnoException).code === 'EPERM';
        }
      },
      processId: process.pid,
      processStartedAt: new Date(performance.timeOrigin),
      bootedAt: new Date(Date.now() - uptime() * 1000),
      browserSelection,
      obsidian: macObsidianPaths(home),
      argv,
      version: VERSION,
      // The build number and attributions build.sh embeds beside the version.
      ...(bundled
        ? {
            release: {
              build: sea.getAsset('build', 'utf8'),
              attributions: () => sea.getAsset('attributions.json', 'utf8'),
            },
          }
        : {}),
      // The release notes: the executable's CHANGELOG.md, or the repo's, beside skills/.
      changelog: bundled
        ? () => sea.getAsset('CHANGELOG.md', 'utf8')
        : () => readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8'),
      // The repo's skills/, beside packages/ (this file is packages/cli/dist/mesa.js), or the
      // executable's, unpacked where projects can link to them.
      skillsDir: bundled
        ? unpackSkills(join(profilesDir(home), '.skills'), VERSION, {
            keys: sea.getAssetKeys,
            get: (key) => sea.getAsset(key),
          })
        : fileURLToPath(new URL('../../../skills', import.meta.url)),
    },
  });
}

// A person at a terminal may be asked something, which only this process can do.
const { code, stdout, stderr, exec, serve }: Awaited<ReturnType<typeof runHere>> =
  (process.stdin.isTTY ? undefined : await forwarded()) ?? (await runHere());
if (exec) {
  // Written synchronously: execve replaces the process before an async write could flush.
  writeSync(1, stdout);
  // env finds the binary on PATH, which execve alone does not. Node 24 (the README's) has execve.
  if (!process.execve) throw new Error('mesa needs Node 24 for process.execve');
  process.execve('/usr/bin/env', ['env', ...exec], process.env);
}
process.stdout.write(stdout);
process.stderr.write(stderr);
process.exitCode = code;
if (serve) {
  const { createInterface } = await import('node:readline');
  await serve({
    lines: createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY }),
    write: (text) => process.stdout.write(text),
    log: (text) => process.stderr.write(text),
  });
  // Served out: stdin's reader would keep the process up (mesa host ends with its agent).
  process.stdout.write('', () => process.exit());
}
