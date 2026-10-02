import type {
  Config,
  DoctorReport,
  HooksStatus,
  PrEventList,
  ProfileInfo,
  ProjectContext,
  ProjectRow,
  SessionRow,
  TmuxWindow,
  UsageReport,
  VaultStatus,
} from '@mesa/core';
import { DEFAULT_SHORTCUTS } from '@mesa/core/browser';
import { envelope } from './replies';

/** A healthy, initialised profile with no projects: each test overrides what it varies. */
export const HEALTHY: Record<string, (args: string[]) => unknown> = {
  agents: () =>
    envelope({
      claude: { installed: true },
      codex: { installed: true },
      antigravity: { installed: true },
    }),
  'projects visit': (args) =>
    envelope({ name: args.at(-1), visits: 1, visitedAt: '2026-09-30T12:00:00.000Z' }),
  'skills list': () => envelope([]),
  'rules list': () => envelope([]),
  // The header's bell reads the inbox on every screen.
  notifications: () => envelope([]),
  prompts: () => envelope([]),
  profile: () => envelope({ profile: 'default', dir: '/h/.mesa/default' } satisfies ProfileInfo),
  config: () =>
    envelope({
      vault: '/h/vault',
      defaultAgent: 'claude',
      skills: [],
      decisions: { backend: 'adapter', adapter: 'claude', threshold: 0.7 },
      sessions: { log: true, statusLineCost: false, prEvents: false },
      usage: { dailyAlertUsd: 0, weeklyAlertUsd: 0, monthlyAlertUsd: 0 },
      notifications: {
        quiet: false,
        visualAlert: true,
        inputRequired: 'sound',
        finished: 'silent',
        subagent: 'silent',
        doctor: 'silent',
      },
      application: { warnBeforeQuit: true, backupOnClose: false },
      onboarding: { status: 'complete', step: 0 },
      appearance: {
        theme: 'system',
        font: 'plex',
        fontSize: 16,
        diffFontSize: 13,
        fileTreeFontSize: 14,
        density: 'comfortable',
        colorVision: 'normal',
      },
      terminal: {
        app: 'Terminal',
        theme: 'follow',
        fontSize: 13,
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        optionAsMeta: false,
        naturalSelection: false,
        scrollSpeed: 3,
        extraSubmitKey: 'none',
        newlineKey: 'native',
        wezTermNewTab: false,
        messageActions: true,
      },
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
      board: { view: 'list', group: 'none', density: 'comfortable', sort: 'attention', order: [] },
      grid: { groups: [] },
      run: { permissionMode: 'acceptEdits', allowedTools: [] },
      agents: { claude: {}, codex: {}, antigravity: {} },
      keys: {},
    } satisfies Config),
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
      tmux: { socket: 'mesa-default', server: true, paneDied: true },
    } satisfies HooksStatus),
};

/** A `config` answer: the healthy profile with these appearance choices over its own. */
export const appearanceConfig = (appearance: Partial<Config['appearance']>) => () => {
  const healthy = HEALTHY.config?.([]) as { data: Config };
  const data = healthy.data;
  return envelope({ ...data, appearance: { ...data.appearance, ...appearance } });
};
