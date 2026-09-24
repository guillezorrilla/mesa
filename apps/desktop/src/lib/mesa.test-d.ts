import { call } from './mesa';

// Type-level test: `pnpm typecheck` fails if call() accepts an unknown command name.
export async function typeTests() {
  // @ts-expect-error 'nope.run' is not in Commands
  await call('nope.run');

  const doctor = await call('doctor.run');
  if (doctor.ok) doctor.data.map((check) => check.name);
}
