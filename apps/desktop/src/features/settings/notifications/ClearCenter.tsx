import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ClearNotificationsDialog } from '@/features/notifications/ClearNotificationsDialog';
import { useCommand } from '@/lib/useCommand';
import { SettingRow } from '../SettingRow';

/** The one action that clears every notice, with the unread count it would clear. */
export function ClearCenter() {
  const inbox = useCommand('notifications.list');
  const [clearing, setClearing] = useState(false);
  const items = inbox.data ?? [];
  const unread = items.filter((item) => !item.read).length;
  return (
    <>
      <SettingRow
        icon={Trash2}
        title="Clear notification center"
        description={inbox.data ? `${unread} unread` : 'Reading notices...'}
        keywords="remove notices inbox"
        control={
          <Button
            size="sm"
            variant="secondary"
            disabled={!items.length}
            onClick={() => {
              // The count the confirmation states is read now, not when Settings opened.
              void inbox.refresh().then(() => setClearing(true));
            }}
          >
            Clear
          </Button>
        }
      />
      {clearing && (
        <ClearNotificationsDialog
          count={items.length}
          unread={unread}
          onCleared={() => {
            setClearing(false);
            void inbox.refresh();
          }}
          onCancel={() => setClearing(false)}
        />
      )}
    </>
  );
}
