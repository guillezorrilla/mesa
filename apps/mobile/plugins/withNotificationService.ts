/// <reference types="node" />
// Adds the Notification Service Extension (#1016, ADR-0027) to the generated Xcode project, so
// ios/ stays generated (CNG). Its sources live in targets/notifications/: the extension, and the
// decrypt logic of the MesaNotice package, whose Package.swift and tests stay out of the target.
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type ConfigPlugin, withDangerousMod, withXcodeProject } from 'expo/config-plugins';

const TARGET = 'MesaNotifications';
const SOURCE = 'targets/notifications';
/** Copied flat into ios/MesaNotifications; the Swift files are what the target compiles. */
const FILES = {
  'NotificationService.swift': 'NotificationService.swift',
  'Notice.swift': 'Sources/MesaNotice/Notice.swift',
  'Info.plist': 'Info.plist',
  'notifications.entitlements': 'notifications.entitlements',
};
const SWIFT = ['NotificationService.swift', 'Notice.swift'];

export const withNotificationService: ConfigPlugin<{ bundleIdentifier: string; teamId: string }> = (
  config,
  { bundleIdentifier, teamId },
) => {
  const entitlements = {
    'keychain-access-groups': [`$(AppIdentifierPrefix)${config.ios?.bundleIdentifier}`],
  };
  // EAS reads this to make the extension's provisioning profile and stamp its build number.
  config.extra = {
    ...config.extra,
    eas: {
      ...config.extra?.eas,
      build: {
        experimental: {
          ios: { appExtensions: [{ targetName: TARGET, bundleIdentifier, entitlements }] },
        },
      },
    },
  };

  config = withDangerousMod(config, [
    'ios',
    (mod) => {
      const into = join(mod.modRequest.platformProjectRoot, TARGET);
      mkdirSync(into, { recursive: true });
      for (const [name, from] of Object.entries(FILES))
        copyFileSync(join(mod.modRequest.projectRoot, SOURCE, from), join(into, name));
      return mod;
    },
  ]);

  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    if (project.pbxTargetByName(TARGET)) return mod;
    const objects = project.hash.project.objects;
    // A fresh Expo project has neither section, which addTarget's dependency step needs.
    objects.PBXTargetDependency ??= {};
    objects.PBXContainerItemProxy ??= {};

    const group = project.addPbxGroup(Object.keys(FILES), TARGET, TARGET);
    project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);
    const target = project.addTarget(TARGET, 'app_extension', TARGET, bundleIdentifier);
    project.addBuildPhase(SWIFT, 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
    project.addTargetAttribute('DevelopmentTeam', teamId, target);

    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const settings = configurations[key]?.buildSettings;
      if (settings?.PRODUCT_NAME !== `"${TARGET}"`) continue;
      Object.assign(settings, {
        INFOPLIST_FILE: `${TARGET}/Info.plist`,
        CODE_SIGN_ENTITLEMENTS: `${TARGET}/notifications.entitlements`,
        CODE_SIGN_STYLE: 'Automatic',
        DEVELOPMENT_TEAM: teamId,
        SWIFT_VERSION: '5.0',
        TARGETED_DEVICE_FAMILY: '"1"',
        // The app's own: an extension whose versions differ from its app is refused on upload.
        MARKETING_VERSION: config.version,
        CURRENT_PROJECT_VERSION: config.ios?.buildNumber ?? '1',
      });
    }
    return mod;
  });
};
