import { Stack } from 'expo-router';
import { use } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import type { Outgoing } from '../compose/useSend';
import { ChatBottom } from './ChatBottom';
import { ChatList } from './ChatList';
import { ChatTop } from './ChatTop';
import { chatItems } from './chatItems';
import { SessionMenu } from './SessionMenu';
import type { SessionDetail } from './useSessionDetail';

/**
 * What a session said and is doing, as a conversation read bottom up: its state, links, goal and
 * crew at the top, the replies and the person's messages (`echoes`, this screen's sends) in time
 * order, then what waits on its turn, its pending prompt and its output by the reply bar; its menu
 * in the header. `onChange` reads it again after the phone changed it.
 */
export function SessionBody({ session, echoes }: { session: SessionDetail; echoes: Outgoing[] }) {
  const { detail, error } = use(session.read);
  if (!detail) return <Screen>{error ? <ErrorNote text={error} /> : null}</Screen>;
  const now = Date.now();
  return (
    <>
      <Stack.Screen
        options={{
          title: detail.row.title,
          headerRight: () => (
            <SessionMenu row={detail.row} archived={detail.archived} onDone={session.again} />
          ),
        }}
      />
      {error ? <ErrorNote text={error} /> : null}
      <ChatList
        id={detail.row.id}
        items={chatItems(detail.replies, echoes)}
        now={now}
        top={
          <ChatTop
            detail={detail}
            now={now}
            loading={session.loadingOlder}
            atMost={session.atMost}
          />
        }
        bottom={<ChatBottom detail={detail} onChange={session.again} />}
        onTop={() => detail.more && session.older()}
      />
    </>
  );
}
