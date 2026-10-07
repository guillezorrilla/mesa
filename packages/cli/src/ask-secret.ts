import type { Writable } from 'node:stream';
import type { ReadStream } from 'node:tty';

/**
 * A secret typed at the terminal without echo: `question` on `output`, then the characters up to
 * Enter, with Backspace; Ctrl+D or the input's end ends it too, and Ctrl+C gives nothing. A
 * pasted value arrives whole. The entrypoint builds it over stdin and stderr, so stdout stays the result.
 */
export const terminalSecret =
  (input: ReadStream, output: Writable) =>
  (question: string): Promise<string> =>
    new Promise((resolve) => {
      output.write(question);
      let typed = '';
      const done = (value: string) => {
        input.off('data', onData);
        input.off('end', ended);
        input.setRawMode(false);
        input.pause();
        output.write('\n');
        resolve(value);
      };
      const onData = (chunk: Buffer) => {
        for (const c of chunk.toString('utf8')) {
          if (c === '\r' || c === '\n' || c === '\u0004') return done(typed);
          if (c === '\u0003') return done('');
          typed = c === '\u007f' || c === '\b' ? typed.slice(0, -1) : typed + c;
        }
      };
      const ended = () => done(typed);
      input.setRawMode(true);
      input.on('data', onData);
      input.once('end', ended);
      input.resume();
    });
