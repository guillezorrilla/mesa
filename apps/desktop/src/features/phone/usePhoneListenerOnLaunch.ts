import { useEffect } from 'react';
import { useCall } from '@/lib/useCommand';

/**
 * Looks at the phone pairing once when the app starts, which restarts a listener still running an
 * older Mesa after an update (#1133); a failure says nothing here, Settings > Phone shows it.
 */
export function usePhoneListenerOnLaunch() {
  const call = useCall();
  useEffect(() => {
    void call('phone.status');
  }, [call]);
}
