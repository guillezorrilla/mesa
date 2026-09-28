import { z } from 'zod';
import type { AgentResult } from '../result.js';

const Result = z.object({
  conversation_id: z.uuid(),
  status: z.string(),
  response: z.string(),
  error: z.string().optional(),
  duration_seconds: z.number().nonnegative(),
  usage: z.record(z.string(), z.number().nonnegative()).optional(),
});

/** The one JSON result `agy --print --output-format json` emits. */
export function readAntigravityResult(stdout: string): AgentResult {
  try {
    const result = Result.parse(JSON.parse(stdout));
    // Headless tool denials may exit SUCCESS with no response. A Mesa skill needs text to land.
    const ok = result.status === 'SUCCESS' && Boolean(result.response.trim());
    return {
      read: true,
      ok,
      output: result.response,
      agentSessionId: result.conversation_id,
      durationMs: Math.round(result.duration_seconds * 1000),
      ...(result.usage ? { usage: result.usage } : {}),
      ...(!ok
        ? {
            reason:
              result.error ??
              (result.status === 'SUCCESS'
                ? 'agy returned no response; check its stderr for denied tools'
                : `agy ended with ${result.status}`),
          }
        : {}),
    };
  } catch {
    return { read: false, reason: 'agy printed an invalid result' };
  }
}
