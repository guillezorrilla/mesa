import { CameraView, useCameraPermissions } from 'expo-camera';
import { Linking, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cameraAskText } from './cameraAskText';

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
  if (!permission.granted) {
    // iOS asks once; after a no, only Settings can turn the camera on.
    const ask = cameraAskText(permission.canAskAgain);
    return (
      <View className="items-center gap-4 rounded-xl border border-border bg-card p-6">
        <Text className="text-center text-muted-foreground">{ask.text}</Text>
        <Button onPress={permission.canAskAgain ? request : () => Linking.openSettings()}>
          <Text>{ask.action}</Text>
        </Button>
      </View>
    );
  }
  return (
    <View className="aspect-square overflow-hidden rounded-xl border border-border bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={paused ? undefined : ({ data }) => onScan(data)}
        accessible
        accessibilityLabel="Camera. Point it at the pairing code on your Mac."
      />
    </View>
  );
}
