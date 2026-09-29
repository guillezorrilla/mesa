import { defineCommand } from '../command.js';

export const browserExternal = defineCommand({
  name: 'browser external',
  summary: 'Open a web URL in the macOS default browser',
  args: ['url'],
  example: 'mesa browser external https://example.com',
  run: async ({ mesa, args }) => {
    const data = await mesa.sessions.browser.external(args.url);
    return { data, text: `opened ${data.url}` };
  },
});

const annotationFlags = {
  url: { type: 'string', required: true, description: 'Selected page URL' },
  title: { type: 'string', required: true, description: 'Selected page title' },
  selector: { type: 'string', required: true, description: 'Selected element selector' },
  text: { type: 'string', required: true, description: 'Bounded visible element text' },
  comment: { type: 'string', required: true, description: 'Person-written annotation' },
  'selection-profile': { type: 'string', required: true, description: 'Profile of the selection' },
} as const;

export const browserSelect = defineCommand({
  name: 'browser select',
  summary: 'Register the current browser element for a session',
  args: ['session'],
  flags: {
    url: annotationFlags.url,
    title: annotationFlags.title,
    selector: annotationFlags.selector,
    text: annotationFlags.text,
    'selection-profile': annotationFlags['selection-profile'],
    'owner-pid': {
      type: 'string',
      required: true,
      description: 'Native app process that owns the selection',
    },
  },
  example:
    'mesa browser select a1b2c3d4 --url https://example.com --title Example --selector h1 --text Heading --selection-profile default --owner-pid 1234',
  run: ({ mesa, args, flags }) => {
    const data = mesa.sessions.browser.select(args.session, {
      profile: flags['selection-profile'],
      url: flags.url,
      title: flags.title,
      selector: flags.selector,
      text: flags.text,
      ownerPid: Number(flags['owner-pid']),
    });
    return { data, text: `selected element for ${args.session}` };
  },
});

export const browserClear = defineCommand({
  name: 'browser clear',
  summary: 'Invalidate the current browser element for a session',
  args: ['session'],
  example: 'mesa browser clear a1b2c3d4',
  run: ({ mesa, args }) => ({
    data: mesa.sessions.browser.clear(args.session),
    text: 'browser selection cleared',
  }),
});

export const browserAnnotationPreview = defineCommand({
  name: 'browser annotate-preview',
  summary: 'Preview the exact page element and user comment for a session',
  args: ['session'],
  flags: annotationFlags,
  example:
    'mesa browser annotate-preview a1b2c3d4 --url https://example.com --title Example --selector h1 --text Heading --comment "Check this" --selection-profile default',
  run: ({ mesa, args, flags }) => {
    const data = mesa.sessions.browser.preview(args.session, {
      profile: flags['selection-profile'],
      url: flags.url,
      title: flags.title,
      selector: flags.selector,
      text: flags.text,
      comment: flags.comment,
    });
    return { data, text: data.prompt };
  },
});

export const browserAnnotationSend = defineCommand({
  name: 'browser annotate-send',
  summary: 'Recheck and send a page annotation through the session guardrail',
  args: ['session'],
  flags: {
    ...annotationFlags,
    source: { type: 'string', required: true, description: 'Source from annotate-preview' },
    revision: { type: 'string', required: true, description: 'Revision from annotate-preview' },
    yes: { type: 'boolean', description: 'Send past a guardrail ask after confirmation' },
    'no-from': { type: 'boolean', description: 'Send as a person, not another Mesa session' },
  },
  example:
    'mesa browser annotate-send a1b2c3d4 --url https://example.com --title Example --selector h1 --text Heading --comment "Check this" --selection-profile default --source <sha256> --revision <sha256>',
  run: async ({ mesa, args, flags, confirm }) => {
    const data = await mesa.sessions.browser.send(
      args.session,
      {
        profile: flags['selection-profile'],
        url: flags.url,
        title: flags.title,
        selector: flags.selector,
        text: flags.text,
        comment: flags.comment,
        source: flags.source,
        revision: flags.revision,
      },
      { yes: flags.yes, noFrom: flags['no-from'], confirm },
    );
    return {
      data,
      text: `${data.status} browser annotation ${data.id.slice(0, 12)} to ${args.session}`,
    };
  },
});
