import { plainText } from '../sessions/window/terminal-text.js';

/**
 * A line a terminal wrote (`mesa logs run`) as plain text: each backspace erases the character
 * before it (script's `^D` then two backspaces), then escape sequences go (plainText).
 */
export function terminalLine(line: string) {
  if (!line.includes('\b') && !line.includes('\x1b')) return line;
  const kept: string[] = [];
  for (const char of line) {
    if (char === '\b') kept.pop();
    else kept.push(char);
  }
  return plainText(kept.join(''));
}
