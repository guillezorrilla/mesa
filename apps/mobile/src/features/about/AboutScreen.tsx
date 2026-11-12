import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { View } from 'react-native';
import { InfoRow } from '@/components/InfoRow';
import { Screen } from '@/components/Screen';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { aboutRows } from './aboutRows';

/** The app's version, build, runtime and running update. */
export function AboutScreen() {
  const rows = aboutRows({
    version: Application.nativeApplicationVersion,
    build: Application.nativeBuildVersion,
    runtimeVersion: Updates.runtimeVersion,
    channel: Updates.channel,
    updateId: Updates.updateId,
    embedded: Updates.isEmbeddedLaunch,
  });
  return (
    <Screen>
      <Card className="py-1">
        <CardContent className="px-5">
          {rows.map((row, index) => (
            <View key={row.label}>
              {index > 0 && <Separator />}
              <InfoRow label={row.label} value={row.value} />
            </View>
          ))}
        </CardContent>
      </Card>
    </Screen>
  );
}
