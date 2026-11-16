// Claude Code's `/context` reply read as data (#1218). In Structured mode claude 2.1.325 answers
// in Markdown:
//
//   ## Context Usage
//   **Model:** claude-haiku-5-5
//   **Tokens:** 23.1k / 1m (2%)
//   ### Estimated usage by category
//   | Category | Tokens | Percentage |
//   |----------|--------|------------|
//   | System prompt | 3.3k | 0.3% |
//
// More tables follow (MCP tools, skills); the card shows the categories, the raw text the rest.

/**
 * One category of the window: its name, its tokens and share as the agent wrote them (`<0.1%`
 * too), and the share as a number for its bar (0 when the agent wrote none).
 */
export type ContextCategory = { name: string; tokens: string; share: string; percent: number };

export type ContextReport = {
  model?: string;
  /** Tokens used and the window, as the agent wrote them (`23.1k`, `1m`). */
  used: string;
  window: string;
  percent: number;
  categories: ContextCategory[];
};

// Each part stops at a character the next one starts with, so no input backtracks far (CodeQL).
const TOKENS = /^\*\*Tokens:\*\* *([^\s/]+) *\/ *([^\s(]+) *\((\d+(?:\.\d+)?)%\)/m;
const MODEL = '**Model:**';

/** The cells of a Markdown table row, or none for a line that is not one. */
const cells = (line: string) =>
  /^\|.*\|$/.test(line.trim())
    ? line
        .trim()
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim())
    : undefined;

/** The report in a `/context` reply, or none when it names no token count. */
export function parseContextReport(output: string): ContextReport | undefined {
  const tokens = TOKENS.exec(output);
  if (!tokens?.[1] || !tokens[2] || !tokens[3]) return undefined;
  const model = output
    .split('\n')
    .find((line) => line.startsWith(MODEL))
    ?.slice(MODEL.length)
    .trim();
  const categories: ContextCategory[] = [];
  // The first table whose header starts with Category, up to its end.
  let inTable = false;
  for (const line of output.split('\n')) {
    const row = cells(line);
    if (!row) {
      if (inTable) break;
      continue;
    }
    if (row[0] === 'Category') inTable = true;
    else if (inTable && !/^-+$/.test(row[0] ?? '')) {
      const [name, count, share] = row;
      const percent = Number.parseFloat((share ?? '').replace(/[^\d.]/g, ''));
      if (name && count && share)
        categories.push({
          name,
          tokens: count,
          share,
          percent: Number.isFinite(percent) ? percent : 0,
        });
    }
  }
  return {
    ...(model ? { model } : {}),
    used: tokens[1],
    window: tokens[2],
    percent: Number(tokens[3]),
    categories,
  };
}
