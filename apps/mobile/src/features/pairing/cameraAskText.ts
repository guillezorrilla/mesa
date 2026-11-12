/** What the scanner says, and its button, before Mesa may use the camera. */
export function cameraAskText(canAskAgain: boolean): { text: string; action: string } {
  return canAskAgain
    ? {
        text: 'Mesa needs the camera to scan the pairing code on your Mac.',
        action: 'Allow camera',
      }
    : {
        text: 'Camera access is off for Mesa. Turn it on in Settings to scan the code, or paste its link below.',
        action: 'Open Settings',
      };
}
