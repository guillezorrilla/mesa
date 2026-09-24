import { createClient } from './client';

// Type-level tests: `pnpm typecheck` fails if call() accepts an unknown command.
export async function typeTests() {
  const client = createClient(async () => null);
  // @ts-expect-error 'nope.run' is not a command
  await client.call('nope.run');

  const doctor = await client.call('doctor.run');
  if (doctor.ok) doctor.data.checks.map((check) => check.status);
}
