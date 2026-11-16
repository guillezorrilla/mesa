// A Claude Code built-in's `key=value` usage list, read as a form (#1218). In Structured mode
// `/config` answers with its settings this way (claude 2.1.325):
//
//   Usage: /config key=value [key=value ...]
//     autoCompact=true|false
//     editor=normal|vim
//     language=<value>
//
// The keys come from the agent at run time, never a copy kept here.

/** One key of the list: a switch (`true|false`), a choice among values, or a free value. */
export type UsageField =
  | { key: string; kind: 'boolean' }
  | { key: string; kind: 'choice'; choices: string[] }
  | { key: string; kind: 'text' };

/** A command's form: the command as it is typed (`/config`) and its keys in the agent's order. */
export type UsageForm = { command: string; fields: UsageField[] };

const HEAD = /^Usage: (\/[\w-]+) key=value\b/;
const LINE = /^\s+([\w.-]+)=(.+)$/;

/** One `key=…` line as a field: `<…>` is free, `true|false` a switch, other `|` lists a choice. */
function field(key: string, values: string): UsageField {
  if (/^<[^>]*>$/.test(values)) return { key, kind: 'text' };
  const choices = values.split('|').map((v) => v.trim());
  if (choices.length === 2 && choices.includes('true') && choices.includes('false'))
    return { key, kind: 'boolean' };
  return { key, kind: 'choice', choices };
}

/**
 * The form in a command's `output`, or none when it is not a `Usage: /cmd key=value` list or
 * lists no key. A line of another shape is left out, so a new kind of line does not hide the rest.
 */
export function parseUsageForm(output: string): UsageForm | undefined {
  const [head = '', ...lines] = output.trim().split('\n');
  const command = HEAD.exec(head)?.[1];
  if (!command) return undefined;
  const fields = lines.flatMap((line) => {
    const m = LINE.exec(line);
    return m?.[1] && m[2] ? [field(m[1], m[2])] : [];
  });
  return fields.length ? { command, fields } : undefined;
}
