import { renderSVG, renderUnicodeCompact } from 'uqr';

/** A link as a QR: an SVG for the app, and block characters for a terminal. */
export const linkQr = (link: string) => ({
  svg: renderSVG(link, { border: 2 }),
  text: renderUnicodeCompact(link, { border: 2 }),
});
