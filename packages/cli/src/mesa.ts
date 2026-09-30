#!/usr/bin/env node
// The CLI entrypoint: the only place that reads process globals or picks the real implementations;
// createMesa (the composition root) wires them.
import { writeSync } from 'node:fs';

const argv = process.argv.slice(2);
// An agent hook outside a Mesa session exits before anything else loads (#22: within 50 ms).
// `mesa hook tmux`, typed without --profile first, is tmux's, which never has a session id.
if (argv[0] === 'hook' && argv[1] !== 'tmux' && !process.env.MESA_SESSION_ID) process.exit(0);

const [{ randomBytes, randomUUID }, { homedir }, { setTimeout: sleep }, { fileURLToPath }] =
  await Promise.all([
    import('node:crypto'),
    import('node:os'),
    import('node:timers/promises'),
    import('node:url'),
  ]);
const { execRunner, macObsidianPaths, systemClock, ulidSource } = await import('@mesa/core');
const { runCli } = await import('./cli.js');
const { COMMANDS } = await import('./commands/index.js');
const { terminalConfirm } = await import('./confirm.js');
const { browserSelection } = await import('./browser-selection.js');

/** All of stdin, for a hook's payload. */
const readStdin = async () => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

const home = homedir();
const { code, stdout, stderr, exec, serve } = await runCli(argv, {
  commands: COMMANDS,
  env: process.env,
  tty: Boolean(process.stdin.isTTY),
  stdin: readStdin,
  // Only a terminal has a person to ask.
  ...(process.stdin.isTTY ? { confirm: terminalConfirm(process.stdin, process.stderr) } : {}),
  mesa: {
    home,
    cwd: process.cwd(),
    clock: systemClock,
    newId: ulidSource(systemClock, randomBytes),
    newUuid: randomUUID,
    sleep: async (ms) => {
      await sleep(ms);
    },
    // This node and this script, so hooks run the same mesa whatever the hook's PATH holds.
    self: [process.execPath, fileURLToPath(import.meta.url)],
    env: process.env,
    run: execRunner,
    processAlive: (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    },
    browserSelection,
    obsidian: macObsidianPaths(home),
    argv,
    // The repo's skills/, beside packages/ (this file is packages/cli/dist/mesa.js).
    skillsDir: fileURLToPath(new URL('../../../skills', import.meta.url)),
  },
});
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
}
