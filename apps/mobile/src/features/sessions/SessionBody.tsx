import SquareTerminal from 'lucide-react-native/icons/square-terminal';
import { use, useState } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { RoundButton } from '@/components/RoundButton';
import { Screen } from '@/components/Screen';
import type { Outgoing } from '../compose/useSend';
import { OutputPane } from '../terminal/OutputPane';
import { ChatBottom } from './ChatBottom';
import { ChatList } from './ChatList';
import { ChatTop } from './ChatTop';
import { chatItems } from './chatItems';
import { SessionBar } from './SessionBar';
import { SessionMenu } from './SessionMenu';
import type { SessionDetail } from './useSessionDetail';

/**
 * What a session said and is doing, as a conversation read bottom up: its state, links, goal and
 * crew at the top, the replies and the person's messages (`echoes`, this screen's sends) in time
 * order, then what waits on its turn and its pending prompt by the reply bar. Its bar holds its
 * menu and a button that shows its output in place of the conversation, as orca's terminal tab.
 */
export function SessionBody({ session, echoes }: { session: SessionDetail; echoes: Outgoing[] }) {
  const { detail, error } = use(session.read);
  const [output, setOutput] = useState(false);
  if (!detail)
    return (
      <>
        <SessionBar />
        <Screen>{error ? <ErrorNote text={error} /> : null}</Screen>
      </>
    );
  const now = Date.now();
  return (
    <>
      <SessionBar row={detail.row}>
        <RoundButton
          icon={SquareTerminal}
          label="Output"
          selected={output}
          onPress={() => setOutput(!output)}
        />
        <SessionMenu row={detail.row} archived={detail.archived} onDone={session.again} />
      </SessionBar>
      {error ? <ErrorNote text={error} /> : null}
      {output ? (
        <OutputPane id={detail.row.id} />
      ) : (
        <ChatList
          id={detail.row.id}
          items={chatItems(detail.replies, echoes, detail.steps)}
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
      )}
    </>
  );
}
