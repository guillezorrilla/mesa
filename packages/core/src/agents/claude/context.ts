import { readFileSync } from 'node:fs';
import type { Env } from '../../lib/process.js';
import type { ContextUse } from '../../sessions/record.js';
import { claudeSettings, claudeTranscripts } from './paths.js';
import { lastUsage, transcriptFile } from './transcripts.js';

// How much of its context window a Claude Code session has used, from its transcript
// (docs/spikes/context-use.md, and ADR-0003's #70 amendment).

const MILLION = 1_000_000;
const DEFAULT_WINDOW = 200_000;

/**
 * A model's native window, from its id: 1M for Opus 4.7 and later, Sonnet 5 and later, and Fable;
 * 200k for the other Claude models; unknown (undefined) for anything else, since a guessed 200k
 * would overstate a 1M session five times over.
 */
export function nativeWindow(model: string): number | undefined {
  // The minor version is one or two digits: `claude-sonnet-4-20250514` has none.
  const m = /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-|$)/.exec(model);
  if (!m) return undefined;
  const [, family, major = '0', minor = '0'] = m;
  const at = (x: number, y: number) =>
    Number(major) > x || (Number(major) === x && Number(minor) >= y);
  const million =
    family === 'fable' || (family === 'opus' && at(4, 7)) || (family === 'sonnet' && at(5, 0));
  return million ? MILLION : DEFAULT_WINDOW;
}

/** Settings and providers that hold a native-1M model to 200k (the model-config docs). */
const HOLDS_TO_200K = [
  'CLAUDE_CODE_DISABLE_1M_CONTEXT',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
];
const on = (value: unknown) =>
  typeof value === 'string' && !['', '0', 'false'].includes(value.toLowerCase());

/** The `env` block of Claude Code's user settings, or none when they do not read. */
function settingsEnv(home: string): Record<string, unknown> {
  try {
    const env = (JSON.parse(readFileSync(claudeSettings(home), 'utf8')) as { env?: unknown }).env;
    return env && typeof env === 'object' ? (env as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * The agent session's context use: its last main-chain reply's input tokens, in percent of the
 * window its model has, held to 200k when `env` or Claude Code's settings say so. None while there
 * is no reading: no transcript, no reply yet, a compaction since, or a model of unknown window.
 * `env` is the one claude runs with: the hook's own, else this mesa's.
 */
export function claudeContext(
  deps: { home: string; env: Env },
  agentSessionId: string,
): ContextUse | undefined {
  const file = transcriptFile(claudeTranscripts(deps.home), agentSessionId);
  const usage = file && lastUsage(file);
  const native = usage ? nativeWindow(usage.model) : undefined;
  if (!usage || native === undefined) return undefined;
  const settings = settingsEnv(deps.home);
  const held = HOLDS_TO_200K.some((name) => on(deps.env[name]) || on(settings[name]));
  const window = held ? Math.min(native, DEFAULT_WINDOW) : native;
  const used = Math.round((10_000 * usage.tokens) / window) / 100;
  return { used, window, at: usage.at, source: 'transcript' };
}
