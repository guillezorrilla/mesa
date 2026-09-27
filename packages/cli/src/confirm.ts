import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

/**
 * A y/N question on `output`, answered by one line of `input`: y or yes is yes, anything else is
 * no, and so is no answer at all (the input ends or has ended, Ctrl+D, Ctrl+C). It always settles.
 * The entrypoint builds it over stdin and stderr, so stdout stays the result.
 */
export const terminalConfirm =
  (input: Readable, output: Writable) =>
  (question: string): Promise<boolean> =>
    new Promise((resolve) => {
      // An input that has ended would never close the interface.
      if (input.readableEnded) return resolve(false);
      const line = createInterface({ input, output });
      // Closed before an answer: readline closes on the input's end, Ctrl+D, and Ctrl+C.
      line.once('close', () => resolve(false));
      line.question(`${question} [y/N] `, (reply) => {
        resolve(/^y(es)?$/i.test(reply.trim()));
        line.close();
      });
    });
