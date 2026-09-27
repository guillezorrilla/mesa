import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { parse } from 'smol-toml';
import { z } from 'zod';
import { MesaError } from '../../lib/result.js';
import * as hooks from '../hooks.js';
import { codexConfig, codexHooks } from './paths.js';

export const HOOK_EVENTS = [
  { event: 'SessionStart' },
  { event: 'UserPromptSubmit' },
  { event: 'PermissionRequest' },
  { event: 'PostToolUse' },
  { event: 'Interrupt' },
  { event: 'Stop' },
  { event: 'SessionEnd' },
] as const;

export const TRUST_HINT =
  'The next Codex start asks you to review hooks: choose "Review hooks" in "Hooks need review" and trust Mesa\'s entries.';
export type CodexHooksStatus = hooks.HookFileStatus & {
  trusted: Record<string, boolean>;
  hint: string;
};
const file = (home: string): hooks.HookFile => ({
  path: codexHooks(home),
  agent: 'codex',
  events: HOOK_EVENTS,
});
const trustSchema = z.object({
  hooks: z
    .object({
      state: z.record(z.string(), z.object({ trusted_hash: z.string().optional() })).optional(),
    })
    .optional(),
});

/** Codex writes trust into config.toml; Mesa reads it and never grants trust itself. */
export function hooksStatus(home: string, self: readonly string[]): CodexHooksStatus {
  const status = hooks.hooksStatus(file(home), self);
  const config = codexConfig(home);
  let state: z.infer<typeof trustSchema>['hooks'];
  try {
    state = existsSync(config)
      ? trustSchema.parse(parse(readFileSync(config, 'utf8'))).hooks
      : undefined;
  } catch {
    // Do not include parser text: it may quote a credential in the user's config.
    throw new MesaError(
      'invalid_config',
      `${config}: cannot read Codex hook trust; fix the TOML before checking trust`,
    );
  }
  const positions = hooks.hookPositions(file(home), self);
  // Codex canonicalizes its hook source, including a symlinked CODEX_HOME (/tmp on macOS).
  const source = existsSync(status.path) ? realpathSync(status.path) : status.path;
  const trusted = Object.fromEntries(
    HOOK_EVENTS.map(({ event }) => {
      const snake = event.replace(
        /[A-Z]/g,
        (letter, index) => `${index ? '_' : ''}${letter.toLowerCase()}`,
      );
      const entries = positions[event] ?? [];
      return [
        event,
        entries.length > 0 &&
          entries.every((position) =>
            Boolean(state?.state?.[`${source}:${snake}:${position}`]?.trusted_hash),
          ),
      ];
    }),
  );
  return { ...status, trusted, hint: Object.values(trusted).every(Boolean) ? '' : TRUST_HINT };
}

export function installHooks(home: string, self: readonly string[]) {
  const result = hooks.installHooks(file(home), self);
  return {
    ...hooksStatus(home, self),
    ...(result.changed ? { hint: TRUST_HINT } : {}),
    changed: result.changed,
  };
}
export function uninstallHooks(home: string, self: readonly string[]) {
  const result = hooks.uninstallHooks(file(home), self);
  return { ...hooksStatus(home, self), changed: result.changed };
}
