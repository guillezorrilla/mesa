// How a session's agent reaches Mesa's vault and Decision model (ADR-0031): the `mesa` CLI, as
// the mesa-vault and mesa skills teach it, with no Mesa MCP server. Its calls are pre-approved
// where the agent takes rules: Claude Code's --allowedTools on every launch, and Codex's rules
// file, which `mesa hooks install` writes. The one owner of which commands those are.

/** The commands that only read: the vault's, and the Decision model's advice. */
const MESA_READS = [
  'mesa vault context',
  'mesa vault search',
  'mesa vault read',
  'mesa vault goals',
  'mesa decisions evaluate',
  'mesa decisions advise',
];
/** The commands that write a session's notes, which a read-only run refuses. */
const MESA_SAVES = ['mesa vault save'];
/** Every Mesa command a session's agent runs unasked, as the app's Session details lists them. */
export const MESA_SESSION_COMMANDS = [...MESA_READS, ...MESA_SAVES];

const claudeRule = (command: string) => `Bash(${command}:*)`;

/** Claude Code's allow rules for every Mesa command a session runs unasked. */
export const CLAUDE_MESA_TOOLS = MESA_SESSION_COMMANDS.map(claudeRule);
/** Claude Code's rules for the saves, which a read-only run disallows (it wins over the allow). */
export const CLAUDE_MESA_SAVES = MESA_SAVES.map(claudeRule);
/**
 * Claude Code's allow rules for an interactive start, resume, fork, host, or background job, one
 * argv word: the `=` form takes one value, so a goal after it is never read as another rule.
 */
export const CLAUDE_MESA_ALLOW = `--allowedTools=${CLAUDE_MESA_TOOLS.join(',')}`;

/**
 * Codex's rules for them (`<CODEX_HOME>/rules/mesa.rules`): an allowed prefix runs without a
 * prompt and outside the sandbox, as the vault and the Decision log are outside the workspace.
 */
export const CODEX_MESA_RULES = `${MESA_SESSION_COMMANDS.map(
  (command) => `prefix_rule(pattern=${JSON.stringify(command.split(' '))}, decision="allow")`,
).join('\n')}\n`;

/**
 * The variable a read-only run sets, so `mesa vault save` refuses it: Codex has no per-run deny,
 * and its rules allow the saves for every session.
 */
export const VAULT_READ_ONLY_VAR = 'MESA_VAULT_READ_ONLY';
