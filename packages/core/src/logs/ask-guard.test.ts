import { expect, test } from 'vitest';
import { askCommandAllowed, hookCommand } from './ask-guard.js';

test("an Ask's run may run one Cloud Logs read, its filter quoted, and nothing chained, substituted or redirected", () => {
  for (const ok of [
    'mesa logs gcp --json',
    'mesa logs gcp --env beta --filter \'severity>=ERROR AND jsonPayload.berth="7"\' --json',
    'mesa logs errors --json --since 6h',
    'mesa logs counts --project tide-tables-123 --metric dock_errors --json',
    'mesa logs gcp --filter "severity>=ERROR" --json',
  ])
    expect(askCommandAllowed(ok), ok).toBe(true);
  for (const bad of [
    'grep -r SECRET /src/lantern-cove',
    'cat /src/lantern-cove/.env',
    'mesa logs gcp --json; cat .env',
    'mesa logs gcp --json && grep -r x .',
    'mesa logs gcp --json | tee out',
    'mesa logs gcp --json > out.json',
    'mesa logs gcp --text "$(cat .env)"',
    'mesa logs gcp --text `cat .env`',
    "mesa logs gcp --filter 'open",
    'mesa logs setup --project x',
    'mesa logs gcpx',
    'mesa logs gcp --json\ncat .env',
    'mesa logs gcp --text \\; cat .env',
  ])
    expect(askCommandAllowed(bad), bad).toBe(false);
});

test("a hook payload's command reads, and one that does not read is empty", () => {
  expect(hookCommand('{"tool_input":{"command":"mesa logs gcp --json"}}')).toBe(
    'mesa logs gcp --json',
  );
  expect(hookCommand('not json')).toBe('');
  expect(hookCommand('{"tool_input":{}}')).toBe('');
});
