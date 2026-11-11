import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { describePairing } from '../phone/describePairing';
import { PairingCodePanel } from '../phone/PairingCodePanel';
import { usePhonePairing } from '../phone/usePhonePairing';
import { SettingRow } from './SettingRow';
import { SettingSection } from './SettingSection';

/** Settings > Phone: pair the Mesa phone app by QR, see the pairing, and end it (ADR-0027). */
export function PhoneSettingsPanel() {
  const { status, code, acting, pair, unpair } = usePhonePairing();
  const paired = status?.paired === true;
  return (
    <SettingSection
      id="pairing"
      title="Pairing"
      description="Pair one iPhone with this profile through Mesa's broker"
    >
      <SettingRow
        icon={Smartphone}
        title={paired ? 'Phone paired' : 'Phone'}
        description={describePairing(status, !!code, Date.now())}
        keywords="phone iphone mobile pair qr push"
        control={
          <Button
            size="sm"
            variant={paired ? 'ghost' : 'secondary'}
            disabled={acting}
            onClick={paired ? unpair : pair}
          >
            {paired ? 'Unpair' : code ? 'New code' : 'Pair phone'}
          </Button>
        }
      >
        {code && <PairingCodePanel code={code} />}
      </SettingRow>
    </SettingSection>
  );
}
