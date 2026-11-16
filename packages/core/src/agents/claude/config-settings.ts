// What each `/config` key means to a person (#1233): its name, a one-line description, its topic,
// and Claude Code's value when none is saved. The names, and the defaults where one is fixed, are
// what claude 2.1.325's own /config panel shows. The keys themselves still come from the agent at
// run time (usage-form.ts); a key this table does not know gets a name from the key, in Other.

/** The topics of the settings list, in the order they show. */
export const CONFIG_GROUPS = [
  'Notifications',
  'Editor and input',
  'Display',
  'Model and thinking',
  'Permissions and plans',
  'Workflows',
  'Other',
] as const;

export type ConfigGroup = (typeof CONFIG_GROUPS)[number];

/** A `/config` key as the settings list shows it; `fallback` is its value when none is saved. */
export type ConfigSetting = {
  key: string;
  name: string;
  description: string;
  group: ConfigGroup;
  fallback?: string;
};

type Known = Omit<ConfigSetting, 'key'>;

const SETTINGS: Record<string, Known> = {
  notifChannel: {
    name: 'Notification channel',
    description: 'How the terminal tells you Claude needs you.',
    group: 'Notifications',
    fallback: 'auto',
  },
  inputNeededNotifEnabled: {
    name: 'Push when action is needed',
    description: 'A mobile push when a permission prompt or a question is waiting.',
    group: 'Notifications',
    fallback: 'false',
  },
  agentPushNotifEnabled: {
    name: 'Push notifications from Claude',
    description: 'Lets Claude send a mobile push when it decides you should know.',
    group: 'Notifications',
    fallback: 'false',
  },
  editor: {
    name: 'Editor mode',
    description: 'Key bindings in the prompt input.',
    group: 'Editor and input',
    fallback: 'normal',
  },
  copyOnSelect: {
    name: 'Copy on select',
    description: 'Selecting text copies it to the clipboard.',
    group: 'Editor and input',
    fallback: 'true',
  },
  copyFullResponse: {
    name: 'Skip the /copy picker',
    description: '/copy takes the whole last response without asking which part.',
    group: 'Editor and input',
    fallback: 'false',
  },
  promptSuggestionEnabled: {
    name: 'Prompt suggestions',
    description: 'Suggests what to type next in the prompt.',
    group: 'Editor and input',
    fallback: 'true',
  },
  gitignore: {
    name: 'Respect .gitignore in file picker',
    description: 'Files ignored by git stay out of @ mentions.',
    group: 'Editor and input',
    fallback: 'true',
  },
  autoConnectIde: {
    name: 'Auto-connect to IDE',
    description: 'Connects to a running IDE when started from an external terminal.',
    group: 'Editor and input',
    fallback: 'false',
  },
  autoInstallIdeExtension: {
    name: 'Auto-install IDE extension',
    description: 'Installs the Claude Code extension in a detected IDE.',
    group: 'Editor and input',
    fallback: 'true',
  },
  externalEditorContext: {
    name: 'Show last response in external editor',
    description: 'Includes the last response when the prompt opens in your editor.',
    group: 'Editor and input',
    fallback: 'false',
  },
  diffTool: {
    name: 'Diff tool',
    description: 'Where proposed file changes are shown.',
    group: 'Editor and input',
    fallback: 'auto',
  },
  leftArrowOpensAgents: {
    name: 'Left arrow opens agents',
    description: 'The left arrow in an empty prompt opens the agents view.',
    group: 'Editor and input',
    fallback: 'true',
  },
  defaultToAgentsView: {
    name: 'Start in agents view',
    description: 'Opens the agents view when Claude Code starts.',
    group: 'Editor and input',
    fallback: 'false',
  },
  theme: {
    name: 'Theme',
    description: "Claude Code's colours in the terminal.",
    group: 'Display',
    fallback: 'dark',
  },
  language: {
    name: 'Language',
    description: 'The language Claude answers in; default is English.',
    group: 'Display',
  },
  reduceMotion: {
    name: 'Reduce motion',
    description: 'Turns down animations such as the spinner shimmer.',
    group: 'Display',
    fallback: 'false',
  },
  autoScroll: {
    name: 'Auto-scroll',
    description: 'Keeps the conversation scrolled to the newest output in fullscreen.',
    group: 'Display',
    fallback: 'true',
  },
  progressBar: {
    name: 'Terminal progress bar',
    description: "Shows long operations in the terminal's own progress bar.",
    group: 'Display',
    fallback: 'true',
  },
  tips: {
    name: 'Show tips',
    description: 'Tips beside the spinner while Claude works.',
    group: 'Display',
    fallback: 'true',
  },
  turnDuration: {
    name: 'Show turn duration',
    description: 'How long each turn took, after it ends.',
    group: 'Display',
    fallback: 'true',
  },
  timeFormat: {
    name: 'Time format',
    description: '12 or 24 hour clock for times shown.',
    group: 'Display',
    fallback: 'auto',
  },
  timestamps: {
    name: 'Show message timestamps',
    description: 'A time beside each message.',
    group: 'Display',
    fallback: 'false',
  },
  prStatus: {
    name: 'Show PR status footer',
    description: "The branch's pull request status under the prompt.",
    group: 'Display',
    fallback: 'true',
  },
  verbose: {
    name: 'Verbose output',
    description: 'Shows full tool output instead of a summary.',
    group: 'Display',
    fallback: 'false',
  },
  recap: {
    name: 'Session recap',
    description: 'A short summary when you come back after being away.',
    group: 'Display',
    fallback: 'true',
  },
  model: {
    name: 'Model',
    description: 'The model new sessions use.',
    group: 'Model and thinking',
    fallback: 'default',
  },
  switchModelsOnFlag: {
    name: 'When a message is flagged',
    description: 'Switch to another model to keep chatting, or pause and ask.',
    group: 'Model and thinking',
  },
  outputStyle: {
    name: 'Output style',
    description: 'How Claude writes its responses.',
    group: 'Model and thinking',
    fallback: 'default',
  },
  thinking: {
    name: 'Thinking mode',
    description: 'Lets Claude think before answering on models that support it.',
    group: 'Model and thinking',
    fallback: 'true',
  },
  autoCompact: {
    name: 'Auto-compact',
    description: 'Compacts the conversation when the context window fills.',
    group: 'Model and thinking',
    fallback: 'true',
  },
  idleCompaction: {
    name: 'Idle compaction',
    description: 'Compacts a long conversation while the session is idle.',
    group: 'Model and thinking',
    fallback: 'true',
  },
  permissionMode: {
    name: 'Default permission mode',
    description: 'The mode a new session starts in.',
    group: 'Permissions and plans',
    fallback: 'default',
  },
  useAutoModeDuringPlan: {
    name: 'Use auto mode during plan',
    description: 'Plan mode works with auto mode rules when auto mode is available.',
    group: 'Permissions and plans',
    fallback: 'true',
  },
  checkpoints: {
    name: 'Rewind code (checkpoints)',
    description: 'Snapshots files before edits so /rewind can restore them.',
    group: 'Permissions and plans',
    fallback: 'true',
  },
  worktreeBaseRef: {
    name: 'Worktree base ref',
    description: 'What a new worktree branches from.',
    group: 'Permissions and plans',
    fallback: 'fresh',
  },
  remoteControl: {
    name: 'Remote Control for all sessions',
    description: 'Starts the Remote Control bridge in every session.',
    group: 'Permissions and plans',
    fallback: 'default',
  },
  // Its default follows the plan, so none is kept here.
  workflows: {
    name: 'Dynamic workflows',
    description: 'Lets Claude run multi-agent workflows.',
    group: 'Workflows',
  },
  workflowKeywordTriggerEnabled: {
    name: 'Ultracode keyword trigger',
    description: 'Saying ultracode in a prompt starts a workflow.',
    group: 'Workflows',
    fallback: 'true',
  },
  workflowSizeGuideline: {
    name: 'Dynamic workflow size',
    description: 'How many agents a workflow may start.',
    group: 'Workflows',
    fallback: 'unrestricted',
  },
};

/** `value` as words: `acceptEdits` and `accept_edits` read "Accept edits". */
export function readableName(value: string): string {
  const words = value
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * `key` as the settings list shows it: from the table, or for a key it does not know, a name made
 * from the key (an `…Enabled` suffix dropped, as the switch says it), no description, in Other.
 */
export function configSetting(key: string): ConfigSetting {
  const known = Object.hasOwn(SETTINGS, key) ? SETTINGS[key] : undefined;
  if (known) return { key, ...known };
  return {
    key,
    name: readableName(key.replace(/(.)Enabled$/, '$1')),
    description: '',
    group: 'Other',
  };
}
