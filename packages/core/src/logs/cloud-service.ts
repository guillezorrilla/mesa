import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { MesaContext } from '../context.js';
import type { GitTextRunner } from '../git/message.js';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import { findProject } from '../projects/projects.js';
import { GENERAL_PROJECT } from '../sessions/record/general.js';
import { streamedText } from '../sessions/run/live.js';
import { callerOf } from '../sessions/window/caller.js';
import {
  askCloudLogs,
  codeProject,
  keepQuery,
  modelEntry,
  queryFromWords,
  runQueries,
} from './ask.js';
import { keepTurn, readAsks } from './ask-history.js';
import { serviceRefOf } from './cloud-entry.js';
import { cloudDeploys, type DeployQuery } from './deploys.js';
import { type CloudErrorGroup, cloudErrors, errorSamples } from './errors.js';
import { askSessionGoal, errorFixGoal } from './fix-goal.js';
import { accessToken, enableErrorReporting, gcloudLogin } from './gcloud.js';
import { type CloudQuery, cloudFilter, cloudFilters, cloudLogs, envOf } from './gcp.js';
import {
  ALL_ENVS,
  type CloudView,
  GCP_PROJECT,
  type GcpLogs,
  GcpLogsSchema,
  PROD_ASK,
  PROD_ENV,
  PROD_WORD,
} from './gcp-config.js';
import { envSuggestions } from './gcp-envs.js';
import { cloudProjects } from './gcp-projects.js';
import { cloudServices } from './gcp-services.js';
import { maskEntry, maskErrors, maskText } from './mask.js';
import { metricCounts, metricViews } from './metrics.js';
import { ownOf } from './own-filters.js';
import { readRange } from './range-read.js';
import { exportViews, importViews, mergeViews } from './views.js';
import { cloudVolume } from './volume.js';

/** Ids and service names, the only words of a group its goal puts outside the log fence. */
const NAME = z.string().regex(/^[\w.:@/-]{1,200}$/);

/** An error group as Fix in session takes it: what its goal reads. */
const FixGroupSchema = z.object({
  project: GCP_PROJECT,
  id: NAME,
  message: z.string(),
  sample: z.string(),
  count: z.number(),
  firstSeen: z.string(),
  lastSeen: z.string(),
  services: z.array(NAME),
  badge: z.enum(['new', 'back']).nullable(),
  source: z.enum(['error-reporting', 'logs']),
});

/** A caller's token for one Ask's streamed answer. */
const STREAM_TOKEN = z
  .string()
  .regex(/^[\w-]{8,64}$/, 'a token of 8 to 64 letters, digits, _ or -');

/** How many GCP projects the switcher's Recent keeps. */
const RECENT = 12;

/**
 * The Logs tab's side of Mesa (CONTEXT.md, Cloud Logs; Ask (logs)): the profile's GCP projects'
 * entries, error groups and metric counts, its setup and saved views, and Ask.
 */
export function cloudLogsService(
  ctx: MesaContext,
  deps: {
    /** The skill run's owner, which Ask runs `cloud-logs` through. */
    runText: GitTextRunner;
    /** The profile's config set, with its receipt and guards. */
    setConfig: (dotted: string, value: string) => unknown;
    /** Opens a session in registered `project` (or General) with `goal`, past the guardrail (`yes` answers its ask). */
    openSession: (project: string, goal: string, yes: boolean) => Promise<unknown>;
  },
) {
  /** The profile's `logs.gcp`; not_found, which the Logs tab shows as its setup, when unset. */
  const gcpConfig = () => {
    const config = ctx.open().config.logs.gcp;
    if (!config)
      throw new MesaError(
        'not_found',
        'Cloud Logs has no GCP project yet: run mesa logs setup --project <id>',
        { reason: 'not_configured' },
      );
    return config;
  };
  /** `projects`, each checked to be one Cloud Logs reads: an agent reads no other. */
  const configuredProjects = (projects: string[]) => {
    const { projects: known } = gcpConfig();
    for (const project of projects)
      if (!known.includes(project))
        throw new MesaError(
          'usage',
          `no GCP project ${project} in logs.gcp.projects: ${known.join(', ')}`,
        );
    return projects;
  };
  const cloudDeps = () => ({ run: ctx.run, now: ctx.clock });
  const errorDeps = () => ({ run: ctx.run, http: ctx.http, now: ctx.clock });
  /** The session whose window runs this mesa, when it is one: an agent, an Ask's run among them. */
  const caller = () => callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile });
  /** What only a person does to Google Cloud: an agent in a Mesa window is refused. */
  const personOnly = (what: string) => {
    if (caller().inMesaWindow)
      throw new MesaError(
        'usage',
        `${what} is a person's to do: from the app, or a terminal outside a Mesa session`,
      );
  };
  // One sign-in refresh before the parallel reads, so the gcloud calls do not each refresh it at
  // once, and a sign-in failure is one error rather than one per project.
  const signedIn = () => accessToken(ctx.run);
  /** What an agent reads is masked unless logs.mask is off (mask.ts). */
  const forAgent = () => caller().inMesaWindow && ctx.open().config.logs.mask;
  /**
   * The first read of prod from each GCP project is needs_approval until a person confirms it
   * (`allowProd`, kept in logs.prodAsk; the config's guard refuses that from a Mesa window).
   * Prod is the env named prod, or a filter (or a metric) that names prod, in the projects read.
   */
  const prodGate = async (filters: Record<string, string>, prodEnv: boolean, allowProd = false) => {
    const { prodAsk } = ctx.open().config.logs;
    const prod = prodEnv || Object.values(filters).some((f) => PROD_WORD.test(f));
    const unasked = Object.keys(filters).filter((project) => !prodAsk.includes(project));
    if (!prod || !unasked.length) return;
    // Only a person confirms: an agent's --allow-prod is no answer.
    if (!allowProd || caller().inMesaWindow)
      throw new MesaError(
        'needs_approval',
        `${PROD_ASK}: confirm once for ${unasked.join(', ')} with --allow-prod`,
        {
          reason: 'prod_ask',
          projects: unasked,
        },
      );
    await deps.setConfig('logs.prodAsk', JSON.stringify([...prodAsk, ...unasked]));
  };
  /** Whether a read in `env` reads prod: the prod env, or every env when one is prod. */
  const readsProd = (config: GcpLogs, env: string | undefined) =>
    env === PROD_ENV || ((env ?? ALL_ENVS) === ALL_ENVS && PROD_ENV in config.envs);
  /** An agent's read of prod passes prodGate first, as Ask's does; a person's read needs none. */
  const agentProdGate = async (config: GcpLogs, query: CloudQuery, env: string | undefined) => {
    if (!caller().inMesaWindow) return;
    await prodGate(
      cloudFilters(config, { ...query, env: env ?? ALL_ENVS }, ctx.clock()),
      readsProd(config, env),
    );
  };
  /**
   * Where an Ask started with stream token `stream` (one its caller made) names its run once it has
   * started, so asking reads that run's answer and no other Ask's.
   */
  const streamFile = (stream: string) =>
    join(ctx.paths.runs, `${parseWith(STREAM_TOKEN, stream, '--stream')}.ask`);
  /** Where an Ask's run keeps the queries it ran, one JSON line each (ask.ts, runQueries). */
  const queriesFile = (session: string) => join(ctx.paths.runs, `${session}.queries.jsonl`);
  const keepQueries = (filters: Record<string, string>, query: CloudQuery) => {
    const run = caller().session;
    if (run?.kind !== 'run') return;
    for (const [project, filter] of Object.entries(filters))
      keepQuery(queriesFile(run.id), { project, filter, own: ownOf(query) });
  };
  /** `views` merged into the saved views (mergeViews). */
  const saveViews = (views: CloudView[]) =>
    deps.setConfig('logs.views', JSON.stringify(mergeViews(ctx.open().config.logs.views, views)));
  return {
    /**
     * The newest Cloud Logs entries `query` picks across the GCP projects (cloudLogs). Read by an
     * agent (a Mesa window), they come masked unless logs.mask is off, and an Ask's run keeps its
     * queries for the conversation.
     */
    gcp: async (query: CloudQuery = {}) => {
      const config = gcpConfig();
      const env = envOf(config, query.env);
      await agentProdGate(config, query, env);
      await signedIn();
      const read = await cloudLogs(cloudDeps(), config, { ...query, env: env ?? ALL_ENVS });
      keepQueries(read.filters, query);
      return {
        projects: config.projects,
        env: env ?? null,
        envs: Object.keys(config.envs),
        ...read,
        entries: forAgent() ? read.entries.map(maskEntry) : read.entries,
      };
    },
    /** The services `env` logged in the last hour in every project, with their kind (cloudServices). */
    gcpServices: async (env?: string) => {
      const config = gcpConfig();
      const name = envOf(config, env);
      await signedIn();
      return { env: name ?? null, ...(await cloudServices(cloudDeps(), config, name)) };
    },
    /** Signs gcloud in (gcloudLogin): the browser opens and the call waits for the person. */
    login: async () => {
      personOnly('Signing in to Google Cloud');
      await gcloudLogin(ctx.run);
      return { signedIn: true };
    },
    /** Turns on the Error Reporting API in configured GCP `project`: a change to that project. */
    enableErrorReporting: async (project: string) => {
      personOnly('Turning on an API in a GCP project');
      configuredProjects([project]);
      await enableErrorReporting(ctx.run, project);
      return { project, enabled: 'clouderrorreporting.googleapis.com' };
    },
    /** gcloud's default project and every project the account sees, or with `search` those holding it. */
    gcpProjects: (search?: string) => cloudProjects(ctx.run, search),
    /** The envs the setup suggests for GCP `projects`: their GKE clusters and Cloud Run suffixes. */
    gcpEnvs: (projects: string[]) =>
      envSuggestions(ctx.run, parseWith(z.array(GCP_PROJECT), projects, '--project')),
    /** Points Cloud Logs at GCP `projects` with `envs`, keeping a service label set before. */
    gcpSetup: async (projects: string[], envs: Record<string, string> = {}) => {
      const service = ctx.open().config.logs.gcp?.service;
      const gcp = parseWith(
        GcpLogsSchema,
        { projects, envs, ...(service ? { service } : {}) },
        'logs.gcp',
      );
      await deps.setConfig('logs.gcp', JSON.stringify(gcp));
      // The switcher's Recent: these first, then the others read before.
      const { recentProjects } = ctx.open().config.logs;
      const recent = [...new Set([...projects, ...recentProjects])].slice(0, RECENT);
      await deps.setConfig('logs.recentProjects', JSON.stringify(recent));
      return { gcp };
    },
    /** Stars GCP `project` in the project switcher, or with `on` false takes its star off. */
    star: async (project: string, on = true) => {
      parseWith(GCP_PROJECT, project, 'project');
      const { starredProjects } = ctx.open().config.logs;
      const starred = on
        ? [...new Set([...starredProjects, project])]
        : starredProjects.filter((p) => p !== project);
      await deps.setConfig('logs.starredProjects', JSON.stringify(starred));
      return { starred };
    },
    /** The error groups across the GCP projects (cloudErrors), masked for an agent. */
    errors: async (query: CloudQuery = {}) => {
      const config = gcpConfig();
      const env = envOf(config, query.env);
      await agentProdGate(config, query, env);
      const found = await cloudErrors(errorDeps(), config, { ...query, env: env ?? ALL_ENVS });
      // An Ask's run keeps the errors read it made as the Logging filter it stands for.
      const errorsOnly = cloudFilter(
        config,
        { ...query, env: env ?? ALL_ENVS, severity: 'error' },
        ctx.clock(),
      );
      keepQueries(
        Object.fromEntries((query.projects ?? config.projects).map((p) => [p, errorsOnly])),
        { ...query, severity: 'error' },
      );
      return forAgent() ? maskErrors(found) : found;
    },
    /** A few recent events of Error Reporting group `id` in GCP `project` (errorSamples). */
    errorSamples: async (project: string, id: string, since?: string) => {
      configuredProjects([project]);
      // Error Reporting keeps every env's events, so an agent's read passes the prod gate.
      if (caller().inMesaWindow)
        await prodGate({ [project]: project }, readsProd(gcpConfig(), ALL_ENVS));
      const events = await errorSamples(errorDeps(), project, id, since);
      return {
        events: forAgent() ? events.map((e) => ({ ...e, message: maskText(e.message) })) : events,
      };
    },
    /** Log-based metric `metric`'s count per 5 minutes in GCP `project` (metricCounts). */
    counts: async (projects: string[], metric: string, since = '1h') => {
      configuredProjects(projects);
      // An agent's count of a prod metric passes the same gate as its reads.
      if (caller().inMesaWindow)
        await prodGate(Object.fromEntries(projects.map((p) => [p, `${p} ${metric}`])), false);
      return metricCounts(errorDeps(), projects, metric, since);
    },
    /** `query`'s entries over its whole range by severity, service and time (cloudVolume). */
    volume: async (query: CloudQuery = {}) => {
      const config = gcpConfig();
      const env = envOf(config, query.env);
      await agentProdGate(config, query, env);
      return cloudVolume(errorDeps(), config, { ...query, env: env ?? ALL_ENVS });
    },
    /** Each deploy of the services `query` shows over its range (cloudDeploys), reused for two minutes. */
    deploys: async (query: DeployQuery = {}) => {
      const config = gcpConfig();
      const env = envOf(config, query.env);
      // Its GKE deploys come from the entries, so an agent's read passes the same gate as theirs.
      await agentProdGate(config, query, env);
      await signedIn();
      return cloudDeploys(
        cloudDeps(),
        config,
        { ...query, env: env ?? ALL_ENVS },
        { file: ctx.paths.cloudDeploys, lock: ctx },
      );
    },
    /** Saved views: the log-based metrics of a project imported, and views shared as YAML. */
    views: {
      importMetrics: async (project: string) => {
        const views = await metricViews(ctx.run, project);
        await saveViews(views);
        return { views };
      },
      export: (file: string) => {
        const { views } = ctx.open().config.logs;
        exportViews(ctx.absolute(file), views);
        return { file: ctx.absolute(file), views: views.length };
      },
      import: async (file: string) => {
        const views = importViews(ctx.absolute(file));
        await saveViews(views);
        return { views };
      },
    },
    /**
     * `question` about the entries `query` picks, answered by a General `cloud-logs` run that
     * cites them (askCloudLogs) and may run read-only queries of its own; a turn of conversation
     * `conversation` when given, else of a new one, kept with the queries it ran. The first Ask
     * on `prod` of each GCP project is needs_approval until `allowProd`, which the config keeps.
     */
    ask: async (
      question: string,
      query: CloudQuery & {
        allowProd?: boolean;
        conversation?: string;
        code?: string;
        stream?: string;
      } = {},
    ) => {
      const config = gcpConfig();
      const env = envOf(config, query.env);
      const { mask, fixProjects, askModel } = ctx.open().config.logs;
      // Prod is what the Ask reads: the env named prod, or filters that name prod, in the projects
      // its services and projects pick; only those projects are confirmed.
      await prodGate(
        cloudFilters(config, { ...query, env: env ?? ALL_ENVS }, ctx.clock()),
        readsProd(config, env),
        query.allowProd,
      );
      const { allowProd: _, conversation, limit: __, code: named, stream, ...kept } = query;
      const streamed = stream === undefined ? undefined : streamFile(stream);
      // Which repo's code Ask reads is a person's call, as logs.fixProjects is.
      if (named !== undefined) personOnly('Naming the code an Ask reads (--code)');
      const earlier = readAsks(ctx.paths.cloudAsks).find((a) => a.id === conversation)?.turns ?? [];
      // Read afresh rather than trust entries a caller sends: the model sees only what gcloud gave.
      const [read, range] = await Promise.all([
        cloudLogs(cloudDeps(), config, { ...query, env: env ?? ALL_ENVS }),
        readRange(
          errorDeps(),
          config,
          { ...kept, env: env ?? ALL_ENVS },
          { mask, deployCache: { file: ctx.paths.cloudDeploys, lock: ctx } },
        ),
      ]);
      // The code it reads (codeProject): the one named, else the asked services', else the entries'.
      const code = codeProject(
        fixProjects,
        kept.services?.length ? kept.services : read.entries.map(serviceRefOf),
        named,
      );
      // What the person typed in a filter (an email in --text) is masked like the entries.
      const filter = Object.entries(read.filters)
        .map(([project, each]) => `${project}: ${mask ? maskText(each) : each}`)
        .join('\n');
      const entries = mask ? read.entries.map(maskEntry) : read.entries;
      // The project's one lookup: its folder goes to the run and on its stdin; not_found when unregistered.
      const codeEntry = code ? findProject(ctx.open(), code) : undefined;
      const asked = await askCloudLogs(
        deps.runText,
        question,
        {
          filter,
          entries,
          range,
          ...(codeEntry ? { code: { name: codeEntry.name, path: codeEntry.path } } : {}),
        },
        earlier,
        {
          model: askModel,
          ...(streamed ? { onStart: (session) => writeFileAtomic(streamed, session, 0o600) } : {}),
        },
      ).finally(() => streamed && rmSync(streamed, { force: true }));
      const queries = [
        ...Object.entries(read.filters).map(([project, each]) => ({
          project,
          filter: each,
          own: ownOf(kept),
        })),
        ...runQueries(queriesFile(asked.run.session)),
      ];
      const turn = {
        at: ctx.clock().toISOString(),
        question,
        query: { ...kept, ...(env ? { env } : {}) },
        answer: asked.answer,
        cited: asked.cited,
        queries,
        session: asked.run.session,
        ...(code ? { code } : {}),
        model: askModel,
        durationMs: asked.run.durationMs,
        ...(asked.run.costUsd === undefined ? {} : { costUsd: asked.run.costUsd }),
        entries: entries.filter((e) => asked.cited.includes(e.id)).map(modelEntry),
      };
      const ask = keepTurn(ctx.paths.cloudAsks, conversation ?? asked.run.session, turn, ctx);
      return {
        conversation: ask.id,
        projects: config.projects,
        env: env ?? null,
        ...read,
        entries: forAgent() ? read.entries.map(maskEntry) : read.entries,
        ...asked,
        queries,
        ...(code ? { code } : {}),
      };
    },
    /**
     * What an Ask's run started at or after `since` has answered so far, while it runs: the text
     * its stream holds (liveRunText); none when no Ask runs.
     */
    // shortcut: the newest live cloud-logs run is taken as the Ask's; two Asks at once in one
    // profile would show one's text in both until they end. Key runs by a caller token if that bites.
    asking: (stream: string) => {
      const file = streamFile(stream);
      const session = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
      return session
        ? { session, text: streamedText(ctx.paths.runs, session) }
        : { session: null, text: '' };
    },
    /**
     * A Logging query for `sentence` (queryFromWords), from the query shown and the context fields
     * of the entries `query` picks (their names only).
     */
    query: async (sentence: string, query: CloudQuery = {}) => {
      const config = gcpConfig();
      const env = envOf(config, query.env);
      const read = await cloudLogs(cloudDeps(), config, {
        ...query,
        env: env ?? ALL_ENVS,
        limit: 200,
      });
      const fields = [...new Set(read.entries.flatMap((e) => Object.keys(e.fields)))];
      return queryFromWords(deps.runText, sentence, { query: query.filter ?? '', fields });
    },
    /**
     * A session in registered `target` (or General) that fixes error `group`, or carries Ask
     * `conversation` on: its goal fences the log text as data and is masked unless logs.mask is
     * off (fix-goal.ts); a group read from prod passes the prod gate; the goal passes the guardrail
     * (`yes` answers its ask).
     */
    session: async (
      target: string,
      input: { group?: unknown; conversation?: string },
      opts: { env?: string; allowProd?: boolean; yes?: boolean } = {},
    ) => {
      const config = gcpConfig();
      const mask = ctx.open().config.logs.mask ? maskText : undefined;
      let goal: string;
      if (input.conversation) {
        const ask = readAsks(ctx.paths.cloudAsks).find((a) => a.id === input.conversation);
        if (!ask) throw new MesaError('not_found', `no Ask conversation ${input.conversation}`);
        goal = askSessionGoal(ask.turns, mask);
      } else {
        const group = parseWith(FixGroupSchema, input.group, 'group') as CloudErrorGroup;
        configuredProjects([group.project]);
        const env = envOf(config, opts.env);
        await prodGate(
          cloudFilters(config, { env: env ?? ALL_ENVS, projects: [group.project] }, ctx.clock()),
          readsProd(config, env),
          opts.allowProd,
        );
        goal = errorFixGoal(group, mask);
      }
      const project = target === 'general' ? GENERAL_PROJECT : target;
      return { session: await deps.openSession(project, goal, Boolean(opts.yes)) };
    },
    /** The kept Ask conversations, newest first. */
    asks: () => ({ asks: readAsks(ctx.paths.cloudAsks) }),
  };
}
