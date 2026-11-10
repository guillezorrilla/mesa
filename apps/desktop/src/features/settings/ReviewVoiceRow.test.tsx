// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { ReviewVoiceRow } from './ReviewVoiceRow';

const PATH = '/Users/rowan/.mesa/default/prs/voice.md';

test('the Review voice row names the file and whether it is set', async () => {
  for (const [text, state] of [
    [null, 'Not set'],
    ['Short questions.', 'Set'],
  ] as const) {
    const { bridge } = fakeBridge({ 'prs voice': () => envelope({ path: PATH, text }) });
    const byTestId = await renderWithMesa(<ReviewVoiceRow />, bridge);
    expect(byTestId('review-voice')[0]?.textContent).toBe(`${state} ${PATH}`);
    expect(document.querySelector('button')?.textContent).toBe(' Copy path');
  }
});
