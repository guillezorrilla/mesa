// The native fingerprint (ADR-0027) decides between an update over the air and a TestFlight
// build. The Notification Service Extension's sources live outside ios/ (CNG), so they are named
// here: a change to it makes a build, never an update its old binary would not run.
/** @type {import('expo/fingerprint').Config} */
module.exports = {
  extraSources: [
    { type: 'dir', filePath: 'targets/notifications', reasons: ['notificationServiceExtension'] },
  ],
  ignorePaths: ['targets/notifications/.build/**/*'],
};
