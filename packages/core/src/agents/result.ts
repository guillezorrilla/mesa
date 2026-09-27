/** The common result of an agent's headless stdout reader. Runtime supplies missing duration. */
export type AgentResult =
  | {
      read: true;
      ok: boolean;
      output: string;
      agentSessionId: string;
      durationMs?: number;
      costUsd?: number;
      usage?: Record<string, number>;
      reason?: string;
    }
  | { read: false; reason: string };
