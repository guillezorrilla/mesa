import type { PhoneRow } from '@mesa/core/phone';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useSessionActions } from './useSessionActions';

/** The header's session menu: stop or resume, fork, hand off, rename, archive or unarchive. */
export function SessionMenu({ row, onDone }: { row: PhoneRow; onDone: () => void }) {
  const open = useSessionActions(row, onDone);
  return (
    <Button size="icon" variant="ghost" onPress={open} accessibilityLabel="Session actions">
      <Icon as={Ellipsis} className="size-6 text-foreground" />
    </Button>
  );
}
