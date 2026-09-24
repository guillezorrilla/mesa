import { stringify } from 'yaml';
import { defineCommand } from '../command.js';

export const config = defineCommand({
  name: 'config',
  summary: 'Print the profile config, key values redacted',
  run: ({ mesa }) => {
    const data = mesa.config.get();
    return { data, text: stringify(data).trimEnd() };
  },
});

export const configSet = defineCommand({
  name: 'config set',
  summary: 'Set one config field; the value is read as YAML',
  args: ['path', 'value'],
  run: ({ mesa, args }) => {
    const value = mesa.config.set(args.path, args.value);
    return { data: { path: args.path, value }, text: `${args.path} = ${JSON.stringify(value)}` };
  },
});
