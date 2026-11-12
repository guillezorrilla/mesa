import { expect, test } from 'vitest';
import { cameraAskText } from './cameraAskText';

test('the scanner asks for the camera, or sends a person who said no to Settings', () => {
  expect(cameraAskText(true).action).toBe('Allow camera');
  expect(cameraAskText(false)).toEqual({
    text: 'Camera access is off for Mesa. Turn it on in Settings to scan the code, or paste its link below.',
    action: 'Open Settings',
  });
});
