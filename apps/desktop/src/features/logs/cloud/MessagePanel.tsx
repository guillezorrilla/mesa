import { jsonObject, plainTitle, splitMessage } from '@mesa/core/browser';
import { MessageBody } from '../shared/MessageBody';
import { JsonPayloadPanel } from './JsonPayloadPanel';

/**
 * A message as Errors and Explorer show it: a JSON one (on one line or printed over many) as its
 * title over its key and value tree, else its text with the stack folded.
 */
export function MessagePanel(props: { message: string; open?: boolean }) {
  const { head, stack } = splitMessage(props.message);
  const whole = jsonObject(props.message);
  const json = whole ?? jsonObject(head);
  return json ? (
    <JsonPayloadPanel
      json={json}
      title={plainTitle(whole ? JSON.stringify(whole) : head)}
      open={props.open}
    />
  ) : (
    <MessageBody message={head} stack={stack} />
  );
}
