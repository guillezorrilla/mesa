import { REDACTED, redactText } from '../lib/redact.js';

// What a receipt keeps of the command that ran it: long texts cut, key values redacted.

/**
 * A long text an action took (send's prompt, open's goal) as its receipt keeps it: key values
 * redacted first, then the first 80 characters, in `inputs` and in the argv word that is the text
 * (or `--flag=<text>`).
 */
export function receiptText(text: string, argv: readonly string[], secrets: readonly string[]) {
  const short = Array.from(redactText(text, secrets)).slice(0, 80).join('');
  const shorten = (word: string) =>
    word === text || word.endsWith(`=${text}`)
      ? word.slice(0, word.length - text.length) + short
      : word;
  return { short, argv: text ? argv.map(shorten) : argv };
}

/**
 * The command line as a receipt records it: `mesa` plus argv, with `***` for the value after a
 * `keys` or `keys.<name>` path and for every occurrence of a key value (`secrets`) in any word.
 * Values shorter than four characters are left alone, so they cannot blank ordinary words.
 */
export function redactCommand(argv: readonly string[], secrets: readonly string[] = []): string {
  const quote = (word: string) => (/^[\w./:=@*-]+$/.test(word) ? word : JSON.stringify(word));
  const scrub = (word: string) => redactText(word, secrets);
  const words = argv.map((arg, i) => {
    const previous = argv[i - 1] ?? '';
    return previous === 'keys' || previous.startsWith('keys.') ? REDACTED : quote(scrub(arg));
  });
  return ['mesa', ...words].join(' ');
}
