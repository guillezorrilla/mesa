import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import {
  profilePaths,
  projectProfile,
  scriptedRunner,
  testDeps,
  thrown,
} from '../testing/index.js';

const rule = {
  name: 'Refresh docs',
  project: 'lantern-cove',
  when: 'cron',
  cron: '*/2 * * * *',
  run: 'refresh',
  guardrail: 'ask',
};

test('rules are optional, private, persistent and profile-isolated, with no runtime or vault effects', () => {
  const runner = scriptedRunner();
  const { mesa, home, dir } = projectProfile(runner.run);
  const paths = profilePaths(home, 'default');
  const vault = join(home, 'vault');
  const files = readdirSync(vault, { recursive: true });
  const config = readFileSync(paths.config);
  const project = readFileSync(join(dir, 'mesa.yaml'));
  const calls = runner.calls.length;
  expect(mesa.automations.list()).toEqual([]);
  expect(existsSync(paths.automations)).toBe(false);
  expect(mesa.automations.add(rule)).toEqual({ ...rule, enabled: true });
  expect(statSync(paths.automations).mode & 0o777).toBe(0o600);
  const restarted = createMesa('default', testDeps(home, { run: runner.run }));
  expect(restarted.automations.list()).toEqual([{ ...rule, enabled: true }]);
  expect(restarted.automations.setEnabled('refresh DOCS', false).enabled).toBe(false);
  expect(mesa.automations.setEnabled(rule.name, true).enabled).toBe(true);
  const other = createMesa('other', testDeps(home));
  other.init({ vault: 'other-vault' });
  expect(other.automations.list()).toEqual([]);
  expect(mesa.automations.remove(rule.name)).toMatchObject(rule);
  expect(mesa.automations.list()).toEqual([]);
  expect(runner.calls.length).toBe(calls);
  expect(readFileSync(paths.config)).toEqual(config);
  expect(readFileSync(join(dir, 'mesa.yaml'))).toEqual(project);
  expect(readdirSync(vault, { recursive: true })).toEqual(files);
  expect(existsSync(`${paths.automations}.lock`)).toBe(false);
});

test('invalid definitions and edits leave the rule bytes unchanged', () => {
  const { mesa, home } = projectProfile(scriptedRunner().run);
  mesa.automations.add(rule);
  const file = profilePaths(home, 'default').automations;
  const before = readFileSync(file);
  for (const input of [
    { ...rule, name: 'refresh docs' },
    { ...rule, name: 'other', project: 'missing' },
    { ...rule, name: 'other', cron: '61 * * * *' },
    { ...rule, name: 'other', cron: '*/0 * * * *' },
    { ...rule, name: 'other', cron: '* * * *' },
    { ...rule, name: 'other', cron: '2-1 * * * *' },
    { ...rule, name: 'other', notes: true, agent: 'antigravity' },
    { ...rule, name: 'other', prompt: 'wrong action' },
    { ...rule, name: 'other', guardrail: undefined },
    { ...rule, name: 'other', typo: true },
    { ...rule, name: 'other', when: 'file', cron: undefined, file: '../outside' },
    { ...rule, name: 'other', when: 'file', cron: undefined, file: '/outside' },
  ]) {
    expect(() => mesa.automations.add(input)).toThrow();
    expect(readFileSync(file)).toEqual(before);
  }
  expect(thrown(() => mesa.automations.remove('missing')).code).toBe('not_found');
  expect(thrown(() => mesa.automations.setEnabled('missing', true)).code).toBe('not_found');
  expect(readFileSync(file)).toEqual(before);
  writeFileSync(file, '- { name: broken }');
  expect(thrown(() => mesa.automations.list()).code).toBe('invalid_config');
});

test('each trigger and action validates its own fields through the public interface', () => {
  const { mesa } = projectProfile(scriptedRunner().run);
  const triggers = [
    { when: 'cron', cron: '0,15-30/5 8-18 * 1-12 0,7' },
    { when: 'file', file: 'docs/spec.md' },
    { when: 'state', state: 'idle' },
  ];
  const actions = [
    { run: 'refresh', notes: false, agent: 'claude' },
    { run: 'skill', skill: 'project-brief', args: ['tides'], agent: 'codex' },
    { run: 'send', session: 'aaaaaaaa', prompt: 'Review tides' },
    { run: 'open', goal: 'Review tides', agent: 'claude' },
  ];
  for (const trigger of triggers)
    for (const action of actions) {
      const input = {
        ...trigger,
        ...action,
        name: `${trigger.when}-${action.run}`,
        project: 'lantern-cove',
        guardrail: 'allow',
      };
      expect(mesa.automations.add(input)).toMatchObject({ ...input, enabled: true });
      for (const missing of [
        trigger.when,
        ...(action.run === 'refresh'
          ? []
          : action.run === 'skill'
            ? ['skill']
            : action.run === 'send'
              ? ['session', 'prompt']
              : ['goal']),
      ]) {
        const bad: Record<string, unknown> = { ...input, name: 'invalid' };
        delete bad[missing];
        expect(() => mesa.automations.add(bad)).toThrow();
      }
    }
  expect(mesa.automations.list()).toHaveLength(12);
});
