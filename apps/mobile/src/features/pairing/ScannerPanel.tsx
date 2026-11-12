import { CameraView, useCameraPermissions } from 'expo-camera';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

/** The camera, reading QR codes for `onScan` while not `paused`; asks for the camera first. */
export function ScannerPanel({
  onScan,
  paused,
}: {
  onScan: (text: string) => void;
  paused: boolean;
}) {
  const [permission, request] = useCameraPermissions();
  if (!permission) return null;
  if (!permission.granted)
    return (
      <View className="items-center gap-3 rounded-lg border border-border bg-card p-6">
        <Text className="text-center text-muted-foreground">
          Mesa needs the camera to scan the pairing code on your Mac.
        </Text>
        <Button onPress={request}>
          <Text>Allow camera</Text>
        </Button>
      </View>
    );
  return (
    <View className="aspect-square overflow-hidden rounded-lg border border-border">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={paused ? undefined : ({ data }) => onScan(data)}
      />
    </View>
  );
}
