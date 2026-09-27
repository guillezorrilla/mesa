import { z } from 'zod';
import type { AgentResult } from '../result.js';

const Event = z.object({ type: z.string() }).passthrough();
const Usage = z.record(z.string(), z.number().nonnegative());

/** Codex exec JSONL: warning items are not failures; only a completed turn is success. */
export function readCodexResult(stdout: string): AgentResult {
  let agentSessionId = '';
  let output = '';
  let answered = false;
  let usage: Record<string, number> | undefined;
  let reason: string | undefined;
  let completed = false;
  try {
    for (const line of stdout.split('\n').filter((line) => line.trim())) {
      const event = Event.parse(JSON.parse(line));
      if (event.type === 'thread.started') agentSessionId = z.string().parse(event.thread_id);
      if (event.type === 'item.completed') {
        const item = Event.parse(event.item);
        if (item.type === 'agent_message') {
          output = z.string().parse(item.text);
          answered = true;
        }
      }
      if (event.type === 'turn.completed') {
        usage = Usage.parse(event.usage);
        completed = true;
      }
      if (event.type === 'error') reason = z.string().parse(event.message);
      if (event.type === 'turn.failed') {
        reason = z.object({ message: z.string() }).parse(event.error).message;
      }
    }
  } catch {
    return { read: false, reason: 'codex printed an invalid exec stream' };
  }
  if (!agentSessionId && !reason) return { read: false, reason: 'codex printed no thread result' };
  if (!completed) reason ??= 'codex stopped before its turn completed';
  else if (!answered) reason ??= 'codex printed no agent message';
  return {
    read: true,
    ok: !reason,
    output,
    agentSessionId,
    ...(usage ? { usage } : {}),
    ...(reason ? { reason } : {}),
  };
}
