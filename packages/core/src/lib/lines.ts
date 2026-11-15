/** Splits stdout chunks into whole lines; a line cut off by a read waits for the rest. */
export function lineSplitter(onLine: (line: string) => void) {
  let rest = '';
  return {
    push(chunk: string) {
      const parts = (rest + chunk).split('\n');
      rest = parts.pop() ?? '';
      for (const part of parts) if (part.trim()) onLine(part);
    },
    /** At exit: a last line with no newline. */
    flush() {
      if (rest.trim()) onLine(rest);
      rest = '';
    },
  };
}
