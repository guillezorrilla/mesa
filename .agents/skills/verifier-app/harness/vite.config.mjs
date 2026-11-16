// The app on Vite with its bridge an HTTP call to this worktree's built CLI, under the profile in
// MESA_HARNESS_PROFILE. fakes.mjs answers what must not run for real (network, the OS); every
// call lands in bridge.log as FAKE or REAL, which is the evidence of what the UI sent.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fake } from './fakes.mjs';

const app = fileURLToPath(new URL('../..', import.meta.url));
const cli = `${app}../../packages/cli/dist/mesa.js`;
const profile = process.env.MESA_HARNESS_PROFILE;
if (!profile) throw new Error('set MESA_HARNESS_PROFILE to a throwaway profile');
const log = (line) => appendFileSync(new URL('bridge.log', import.meta.url), `${line}\n`);

export default defineConfig({
  // The app folder is the root, so Tailwind scans src for its classes.
  root: app,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'mesa-bridge',
      configureServer(server) {
        // A Structured session's live chat (the app's Rust follow): `mesa chat --follow` streamed
        // back as its lines, killed when the page lets go.
        const following = new Map();
        server.middlewares.use('/__follow_write', (req, res) => {
          const child = following.get(new URL(req.url ?? '', 'http://harness').searchParams.get('key'));
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            if (child) child.stdin.write(`${body}\n`);
            log(`FOLLOW_WRITE ${child ? 'sent' : 'no follow'} ${body.slice(0, 120)}`);
            res.statusCode = child ? 204 : 409;
            res.end();
          });
        });
        server.middlewares.use('/__follow', (req, res) => {
          const url = new URL(req.url ?? '', 'http://harness');
          const args = ['chat', '--follow', '--count', url.searchParams.get('count') ?? '20'];
          const child = spawn('node', [cli, ...args, '--', url.searchParams.get('session') ?? ''], {
            env: { ...process.env, MESA_PROFILE: profile, MESA_SESSION_ID: '' },
          });
          log(`FOLLOW ${url.searchParams.get('session')}`);
          // Its stdin takes the chat's requests (follow_write), by the key the page gave it.
          const key = url.searchParams.get('key') ?? '';
          following.set(key, child);
          child.on('close', () => following.delete(key));
          res.setHeader('content-type', 'text/plain');
          child.stdout.pipe(res);
          res.on('close', () => child.kill());
        });
        server.middlewares.use('/__mesa', (req, res) => {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            const { args, stdin } = JSON.parse(body);
            const send = (value) => {
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify(value));
            };
            const faked = fake(args.filter((arg) => arg !== '--json'));
            if (faked) {
              log(`FAKE ${args.join(' ')}`);
              return send(faked);
            }
            const child = spawn('node', [cli, ...args], {
              env: { ...process.env, MESA_PROFILE: profile, MESA_SESSION_ID: '' },
            });
            let out = '';
            let err = '';
            child.stdout.on('data', (chunk) => {
              out += chunk;
            });
            child.stderr.on('data', (chunk) => {
              err += chunk;
            });
            child.stdin.end(stdin ?? '');
            child.on('close', (code) => {
              log(`REAL ${args.join(' ')} -> ${code}`);
              try {
                send(JSON.parse(out));
              } catch {
                send({ ok: false, error: { code: 'bridge', message: err || 'no envelope' } });
              }
            });
          });
        });
      },
    },
  ],
  resolve: { alias: { '@': `${app}src` } },
  server: { port: 1461, strictPort: true, fs: { allow: [app, `${app}../..`] } },
});
