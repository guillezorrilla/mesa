import type { PhoneRow } from '@mesa/core/phone';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import { RoundButton } from '@/components/RoundButton';
import { useSessionActions } from './useSessionActions';

/** The session bar's menu: stop or resume, fork, hand off, rename, archive or unarchive. */
export function SessionMenu({
  row,
  archived,
  onDone,
}: {
  row: PhoneRow;
  archived: boolean;
  onDone: () => void;
}) {
  const open = useSessionActions(row, archived, onDone);
  return <RoundButton icon={Ellipsis} label="Session actions" onPress={open} />;
}
