// A log entry's stack trace as the Logs panel folds it (CONTEXT.md, Logs panel): the exception and
// the project's own first frame shown, the rest behind "+N frames", framework frames marked. Pure,
// so the app bundles it (`@mesa/core/browser`).

/** Packages and paths that are a framework's or the runtime's, never the project's own code. */
const FRAMEWORK = [
  'org.springframework.',
  'java.',
  'javax.',
  'jdk.',
  'sun.',
  'jakarta.',
  'org.apache.',
  'io.netty.',
  'kotlin.',
  'kotlinx.',
  'com.fasterxml.',
  'node:',
  'node_modules/',
];
/** What a frame line calls (`com.example.Dock.moor(Dock.java:42)`), or undefined for no `at` line. */
function frameTarget(text: string) {
  const line = text.trimStart();
  // String work, not a regex, as log lines are untrusted and a backtracking pattern could hang.
  return /^at\s/.test(line) ? line.slice(3).trimStart() : undefined;
}

/** A frame's file and line, as Java (`(Dock.java:88)`) or Node (`(src/dock.ts:88:31)`) prints it. */
function location(text: string) {
  const open = text.lastIndexOf('(');
  const close = text.lastIndexOf(')');
  if (open < 0 || close < open) return undefined;
  const [path = '', line = ''] = text.slice(open + 1, close).split(':');
  const file = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  return file && /^\d+$/.test(line) ? `${file}:${line}` : undefined;
}

export type StackLine = {
  text: string;
  /** An `at ...` line, not an exception's name or a `Caused by:`. */
  frame: boolean;
  /** A frame in a framework's or the runtime's code. */
  framework: boolean;
};

export type StackView = {
  lines: StackLine[];
  /** The lines shown folded: the exception, and the first frame of the project's own code. */
  folded: StackLine[];
  /** How many lines the fold hides. */
  hidden: number;
};

const isFramework = (target: string) =>
  FRAMEWORK.some(
    (prefix) =>
      target.startsWith(prefix) || target.includes(`(${prefix}`) || target.includes(`/${prefix}`),
  );

/** `stack`'s lines, marked frame or not and framework or not. */
export function stackLines(stack: string): StackLine[] {
  return stack.split('\n').map((text) => {
    const target = frameTarget(text);
    return {
      text,
      frame: target !== undefined,
      framework: target !== undefined && isFramework(target),
    };
  });
}

/** `stack` folded to its exception line and its first own frame (else its first frame). */
export function stackView(stack: string): StackView {
  const lines = stackLines(stack);
  const exception = lines.find((line) => !line.frame);
  const own =
    lines.find((line) => line.frame && !line.framework) ?? lines.find((line) => line.frame);
  const folded = lines.filter((line) => line === exception || line === own);
  return { lines, folded, hidden: lines.length - folded.length };
}

/** Where the first frame of the project's own code is, as `File.java:88`; undefined with none. */
export function ownFrame(stack: string | null) {
  const own = stack && stackLines(stack).find((line) => line.frame && !line.framework);
  return own ? location(own.text) : undefined;
}

/**
 * `stack` for an agent: its exceptions and the project's own frames, each run of framework frames
 * one `... N framework frames` line.
 */
export function stackSummary(stack: string) {
  const out: string[] = [];
  let skipped = 0;
  const flush = () => {
    if (skipped) out.push(`    ... ${skipped} framework frame${skipped === 1 ? '' : 's'}`);
    skipped = 0;
  };
  for (const line of stackLines(stack)) {
    if (line.framework) skipped++;
    else {
      flush();
      out.push(line.text);
    }
  }
  flush();
  return out.join('\n');
}
