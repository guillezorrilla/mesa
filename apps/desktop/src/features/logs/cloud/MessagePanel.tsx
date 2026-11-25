import { jsonObject, plainTitle, splitMessage } from '@mesa/core/browser';
import { MessageBody } from '../shared/MessageBody';
import { JsonPayloadPanel } from './JsonPayloadPanel';

/** A message as Errors shows it: a JSON one as its title over its fields, else its text with the stack folded. */
export function MessagePanel(props: { message: string; open?: boolean }) {
  const { head, stack } = splitMessage(props.message);
  const json = jsonObject(head);
  return json ? (
    <JsonPayloadPanel json={json} title={plainTitle(head)} open={props.open} />
  ) : (
    <MessageBody message={head} stack={stack} />
  );
}
