import { stringify } from 'yaml';
import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const config = defineCommand({
  name: 'config',
  summary: 'Print the profile config, key values redacted',
  example: 'mesa config',
  run: ({ mesa }) => {
    const data = mesa.config.get();
    return { data, text: stringify(data).trimEnd() };
  },
});

export const configSet = defineCommand({
  name: 'config set',
  summary: 'Set one config field; the value is read as YAML',
  args: ['path', 'value'],
  example: 'mesa config set decisions.threshold 0.6',
  run: ({ mesa, args }) => {
    const recorded = mesa.config.set(args.path, args.value);
    const { value } = recorded.result;
    const text = `${args.path} = ${JSON.stringify(value)}`;
    return recordedOutput(recorded, { data: { path: args.path, value }, text });
  },
});
