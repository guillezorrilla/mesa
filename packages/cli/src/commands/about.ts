import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

export const about = defineCommand({
  name: 'about',
  summary: "Show Mesa's version, build, links, and how many third-party attributions it ships",
  example: 'mesa about',
  run: ({ mesa }) => {
    const data = mesa.about();
    const count = data.attributions.length;
    const text = [
      `Mesa ${data.version} (build ${data.build}), ${data.license} license`,
      ...columns([
        ['Docs', data.links.docs],
        ['Support', data.links.support],
        ['Releases', data.links.releases],
      ]),
      `${count} third-party attribution${count === 1 ? '' : 's'}: mesa about licenses`,
      ...(data.note ? [data.note] : []),
    ].join('\n');
    return { data, text };
  },
});

export const aboutLicenses = defineCommand({
  name: 'about licenses',
  summary: 'List the third-party packages Mesa ships, with their versions and licenses',
  example: 'mesa about licenses',
  run: ({ mesa }) => {
    const { attributions, note } = mesa.about();
    const rows = columns(attributions.map((a) => [a.name, a.version, a.license]));
    return { data: attributions, text: (rows.length ? rows : [note ?? '']).join('\n') };
  },
});
