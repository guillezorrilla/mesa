import { Mail, MailOpen } from 'lucide-react';

/**
 * A card menu's Mark as unread item content (Mark as read when unread), counting the chosen cards
 * when several are; both card menus show it.
 */
export function MarkUnreadItem(props: { unread: boolean; count: number }) {
  const to = props.unread ? 'read' : 'unread';
  return (
    <>
      {props.unread ? <MailOpen aria-hidden /> : <Mail aria-hidden />}
      {`Mark ${props.count > 1 ? `${props.count} sessions ` : ''}as ${to}`}
    </>
  );
}
