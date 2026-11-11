import { renderSVG, renderUnicodeCompact } from 'uqr';

/** A pairing link as a QR: an SVG for the app's Settings, and block characters for a terminal. */
export const pairingQr = (link: string) => ({
  svg: renderSVG(link, { border: 2 }),
  text: renderUnicodeCompact(link, { border: 2 }),
});
