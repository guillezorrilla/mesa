import type {
  Config,
  DecisionStatus,
  DoctorReport,
  HooksStatus,
  PrEventList,
  ProfileInfo,
  ProfileRow,
  ProjectContext,
  ProjectRow,
  SessionRow,
  TmuxWindow,
  UsageReport,
  VaultStatus,
} from '@mesa/core';
import { DEFAULT_SHORTCUTS, DEFAULT_TERMINAL_PREFERENCES } from '@mesa/core/browser';
import { envelope } from './replies';

/** A healthy, initialised profile with no projects: each test overrides what it varies. */
export const HEALTHY: Record<string, (args: string[]) => unknown> = {
  'automations list': () => envelope([]),
  'automations status': () =>
    envelope({
      installed: false,
      loaded: false,
      label: 'com.mesa.automations.default',
      plist: '/test/LaunchAgents/com.mesa.automations.default.plist',
      observations: {},
      runs: [],
    }),
  agents: () =>
    envelope({
      claude: { installed: true },
      codex: { installed: true },
      antigravity: { installed: true },
    }),
  'projects visit': (args) =>
    envelope({ name: args.at(-1), visits: 1, visitedAt: '2026-09-30T12:00:00.000Z' }),
  'skills list': () => envelope([]),
  'update channel': () => envelope({ channel: 'beta' }),
  'instructions list': () => envelope([]),
  // Settings > Connections, which a settings search renders too.
  'sources list': () =>
    envelope({
      sources: [{ id: 'atlassian', label: 'Atlassian', connected: false, status: 'disconnected' }],
    }),
  // A session's details: no Decision model, so every site is off.
  'decisions status': (args) =>
    envelope({
      session: args.at(-1) ?? '',
      project: 'lantern-cove',
      model: 'none',
      off: false,
      sites: (['relevance', 'next-step', 'evidence'] as const).map((site) => ({
        site,
        mode: 'off' as const,
      })),
      deadlines: { automatic: 3000, 'on-demand': 10000 },
      packetChars: 4096,
      ready: 0,
      use: [],
    } satisfies DecisionStatus),
  // The Board's placing call beside its look, made only while a row is unsure.
  'decisions place': () => envelope({ placed: [] }),
  // Settings > Smarter decisions, which a settings search renders too.
  'decisions key list': () =>
    envelope({
      keys: [
        { provider: 'typesafe', set: false },
        { provider: 'cloudflare', set: false },
      ],
    }),
  // The project screen's Import panel.
  'import list': () => envelope({ items: [] }),
  // The header's bell reads the inbox on every screen.
  notifications: () => envelope([]),
  prompts: () => envelope([]),
  profile: () => envelope({ profile: 'default', dir: '/h/.mesa/default' } satisfies ProfileInfo),
  'profile list': () => envelope([profileRow('default', { current: true, app: true })]),
  config: () =>
    envelope({
      vault: '/h/vault',
      vaultCapture: true,
      defaultAgent: 'claude',
      skills: [],
      decisions: { model: 'none', threshold: 0.7 },
      sessions: { log: true, statusLineCost: false, prEvents: false, guidelines: true },
      usage: { dailyAlertUsd: 0, weeklyAlertUsd: 0, monthlyAlertUsd: 0 },
      notifications: {
        quiet: false,
        visualAlert: true,
        inputRequired: 'sound',
        automation: 'silent',
        finished: 'silent',
        subagent: 'silent',
        doctor: 'silent',
      },
      application: { warnBeforeQuit: true, backupOnClose: false },
      onboarding: { status: 'complete', step: 0, discovery: 'complete', decisionTip: 'dismissed' },
      appearance: {
        theme: 'system',
        font: 'plex',
        fontSize: 16,
        diffFontSize: 13,
        fileTreeFontSize: 14,
        density: 'comfortable',
        colorVision: 'normal',
      },
      terminal: { app: 'Terminal', ...DEFAULT_TERMINAL_PREFERENCES },
      editor: { fontSize: 13, tabSize: 2, wordWrap: false, vim: false, external: [] },
      worktrees: {
        location: 'profile',
        fetch: false,
        sparseDirectories: [],
        carryIgnoredDirectories: [],
        setup: [],
        teardown: [],
        deleteBranch: false,
      },
      shortcuts: { ...DEFAULT_SHORTCUTS },
      projects: { sort: 'name' },
      grid: { groups: [] },
      run: { permissionMode: 'acceptEdits', allowedTools: [] },
      agents: { claude: {}, codex: {}, antigravity: {} },
      update: {},
      keys: {},
    } satisfies Config),
  'obsidian vaults': () => envelope({ vaults: [], suggested: '/h/Documents/Mesa' }),
  'vault status': () => envelope({ path: '/h/vault', ok: true, missing: [] } satisfies VaultStatus),
  'vault context': (args) =>
    envelope({
      project: args[4] ?? '',
      hub: null,
      index: [],
      notes: [],
      decisions: [],
      goals: [],
      more: '',
    } satisfies ProjectContext),
  'vault mcp': () => envelope({ tools: [] }),
  doctor: () => envelope({ healthy: true, summary: 'ready', checks: [] } satisfies DoctorReport),
  diagnostics: () => envelope({ events: [], total: 0, limit: 100 }),
  projects: () => envelope([] satisfies ProjectRow[]),
  receipts: () => envelope([]),
  sessions: () => envelope([] satisfies SessionRow[]),
  usage: () => {
    const zero = {
      events: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      estimatedCostUsd: 0,
    };
    return envelope({
      rows: [],
      unknown: [],
      periods: { today: zero, '7d': zero, '30d': zero, '90d': zero, month: zero },
      daily: [],
      breakdown: [],
      agents: [],
      alerts: [],
    } satisfies UsageReport);
  },
  windows: () => envelope([] satisfies TmuxWindow[]),
  'pr-events': () =>
    envelope({
      enabled: false,
      gh: { state: 'ready', version: 'gh version 2.test' },
      events: [],
      problems: [],
    } satisfies PrEventList),
  'hooks status': () =>
    envelope({
      path: '/h/.claude/settings.json',
      installed: true,
      stale: false,
      events: {},
      codex: {
        path: '/h/.codex/hooks.json',
        installed: true,
        stale: false,
        events: {},
        trusted: {},
        hint: '',
      },
      antigravity: {
        path: '/h/.gemini/config/hooks.json',
        installed: true,
        stale: false,
        events: { PreInvocation: true },
      },
      antigravityVault: {
        path: '/h/.gemini/config/mcp_config.json',
        rulePath: '/h/.gemini/antigravity-cli/settings.json',
        installed: true,
        stale: false,
        server: true,
        rule: true,
        disabled: false,
      },
      antigravityDecisions: {
        path: '/h/.gemini/config/mcp_config.json',
        rulePath: '/h/.gemini/antigravity-cli/settings.json',
        installed: true,
        stale: false,
        server: true,
        rule: true,
        disabled: false,
        wanted: true,
      },
      tmux: { socket: 'mesa-default', server: true, paneDied: true },
      needsUpdate: false,
    } satisfies HooksStatus),
};

/** A `config` answer: the healthy profile with these appearance choices over its own. */
export const appearanceConfig = (appearance: Partial<Config['appearance']>) => () => {
  const healthy = HEALTHY.config?.([]) as { data: Config };
  const data = healthy.data;
  return envelope({ ...data, appearance: { ...data.appearance, ...appearance } });
};

/** A `profile list` row: an idle profile with its own vault, as the others are unless told. */
export const profileRow = (name: string, row: Partial<ProfileRow> = {}): ProfileRow => ({
  name,
  dir: `/h/.mesa/${name}`,
  vault: `/h/vault-${name}`,
  projects: 0,
  liveSessions: 0,
  lastUsed: '2026-10-08T10:00:00.000Z',
  current: false,
  app: false,
  ...row,
});
