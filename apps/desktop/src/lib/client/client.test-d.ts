import { createClient } from '.';

// Type-level tests: `pnpm typecheck` fails if call() accepts a wrong command or arguments.
export async function typeTests() {
  const client = createClient(async () => null);
  // @ts-expect-error 'nope.run' is not a command
  await client.call('nope.run');
  // @ts-expect-error projects.register needs { path }
  await client.call('projects.register');
  // @ts-expect-error doctor.run takes no arguments
  await client.call('doctor.run', { path: '/x' });

  const doctor = await client.call('doctor.run');
  if (doctor.ok) doctor.data.checks.map((check) => check.status);
  const registered = await client.call('projects.register', { path: '/src/new' });
  if (registered.ok) registered.data.name.toUpperCase();
}
