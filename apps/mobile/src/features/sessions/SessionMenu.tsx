import type { PhoneRow } from '@mesa/core/phone';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import { HeaderButton } from '@/components/HeaderButton';
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
  return <HeaderButton icon={Ellipsis} label="Session actions" filled onPress={open} />;
}
