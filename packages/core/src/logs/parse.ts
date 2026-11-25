// Log entries (CONTEXT.md, Logs panel): what a local server printed, one entry per logged event,
// read from Spring Boot's console line, a JSON line, or any other line.

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type ServerLogEntry = {
  /** When it was logged, as the line wrote it (else as docker stamped it); null when neither did. */
  time: string | null;
  level: LogLevel | null;
  message: string;
  /** The stack trace lines folded under it, null when none followed. */
  stack: string | null;
};

/** One raw line, and the time its source stamped it with (`docker logs --timestamps`), if any. */
export type RawLine = { text: string; time?: string };

const TIME = String.raw`\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:[.,]\d+)?(?:Z|[+-]\d\d:?\d\d)?`;
/** Spring Boot's default console line: time, level, pid, `---`, [app] [thread], logger ` : ` text. */
const SPRING = new RegExp(
  `^(${TIME})\\s+(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\\s+\\d+\\s+---\\s+(?:\\[[^\\]]*\\]\\s*)*\\S+\\s+:\\s(.*)$`,
);
/** A time a plain line starts with. */
const LEADING_TIME = new RegExp(`^\\[?(${TIME})\\]?\\s+`);
const LEVEL_WORD = /\b(ERROR|FATAL|WARN|WARNING|INFO|DEBUG|TRACE)\b/;
/** A stack line that belongs to the entry before it: an indented `at`, `Caused by:`, `... 3 more`, or a Java exception's name. */
const STACK =
  /^(\s+at\s|\s*Caused by:|\s*Suppressed:|\s+\.\.\. \d+ (more|common frames omitted)|([a-z_$][\w$]*\.)+[\w$]*(Exception|Error|Throwable)\b)/;

const LEVEL_WORDS: Record<string, LogLevel> = {
  fatal: 'error',
  error: 'error',
  err: 'error',
  severe: 'error',
  critical: 'error',
  alert: 'error',
  emergency: 'error',
  warn: 'warn',
  warning: 'warn',
  info: 'info',
  notice: 'info',
  debug: 'debug',
  trace: 'debug',
};

const PINO_LEVELS: readonly (readonly [number, LogLevel])[] = [
  [50, 'error'],
  [40, 'warn'],
  [30, 'info'],
  [10, 'debug'],
];

/** A level as a logger names it, or pino's number (50 error, 40 warn, 30 info, 20 and 10 debug). */
function levelOf(value: unknown): LogLevel | null {
  if (typeof value === 'number') return PINO_LEVELS.find(([floor]) => value >= floor)?.[1] ?? null;
  return typeof value === 'string' ? (LEVEL_WORDS[value.toLowerCase()] ?? null) : null;
}

/** A JSON line with `severity` or `level` and `message` or `msg`, else undefined. */
function jsonEntry(text: string): ServerLogEntry | undefined {
  if (!text.startsWith('{')) return undefined;
  let line: Record<string, unknown>;
  try {
    line = JSON.parse(text);
  } catch {
    return undefined;
  }
  const message = line.message ?? line.msg;
  const level = line.severity ?? line.level;
  if (typeof message !== 'string' || level === undefined) return undefined;
  const time = line.time ?? line.timestamp ?? line['@timestamp'] ?? line.ts;
  const stack = line.stack ?? line.stack_trace;
  return {
    time:
      typeof time === 'string'
        ? time
        : typeof time === 'number'
          ? new Date(time).toISOString()
          : null,
    level: levelOf(level),
    message,
    stack: typeof stack === 'string' && stack ? stack : null,
  };
}

/** One line as an entry: Spring Boot's, a JSON one, else any line with the level word it holds. */
function entryOf(line: RawLine): ServerLogEntry {
  const spring = SPRING.exec(line.text);
  if (spring)
    return {
      time: spring[1] ?? null,
      level: levelOf(spring[2]),
      message: spring[3] ?? '',
      stack: null,
    };
  const json = jsonEntry(line.text);
  if (json) return { ...json, time: json.time ?? line.time ?? null };
  const timed = LEADING_TIME.exec(line.text);
  return {
    time: timed?.[1] ?? line.time ?? null,
    level: levelOf(LEVEL_WORD.exec(line.text)?.[1]),
    message: line.text,
    stack: null,
  };
}

/**
 * `lines` as log entries, oldest first. A stack line (an indented `at ...`, `Caused by:`, an
 * exception's name) folds into the entry before it as its `stack`; blank lines are dropped.
 */
export function parseLog(lines: readonly (string | RawLine)[]): ServerLogEntry[] {
  const entries: ServerLogEntry[] = [];
  for (const each of lines) {
    const line = typeof each === 'string' ? { text: each } : each;
    if (!line.text.trim()) continue;
    const last = entries.at(-1);
    if (last && STACK.test(line.text)) {
      last.stack = last.stack ? `${last.stack}\n${line.text}` : line.text;
      continue;
    }
    entries.push(entryOf(line));
  }
  return entries;
}

/** Whether `entry` is at `level` or more severe; every entry passes with no level. */
export const atLeast = (entry: ServerLogEntry, level?: LogLevel) =>
  !level || (entry.level !== null && LOG_LEVELS.indexOf(entry.level) <= LOG_LEVELS.indexOf(level));

/** How a level is printed: its word in capitals. */
export const LEVEL_NAMES: Record<LogLevel, string> = {
  error: 'ERROR',
  warn: 'WARN',
  info: 'INFO',
  debug: 'DEBUG',
};

/**
 * An entry as text: `time` (the entry's own unless given, as the app shows a clock time), its
 * level unless its message already holds the word, the message, and its stack on the lines under.
 */
export function entryText(entry: ServerLogEntry, time = entry.time) {
  const level = entry.level && LEVEL_NAMES[entry.level];
  const line = [time, level && !entry.message.includes(level) && level, entry.message]
    .filter(Boolean)
    .join(' ');
  return entry.stack ? `${line}\n${entry.stack}` : line;
}
