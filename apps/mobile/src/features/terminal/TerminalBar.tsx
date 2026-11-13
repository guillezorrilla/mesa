import ArrowUp from 'lucide-react-native/icons/arrow-up';
import { View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { SendNote } from '../compose/SendNote';
import { useSend } from '../compose/useSend';
import { ctrlKeyOf } from './ctrlKey';
import { KeyRow } from './KeyRow';
import { useKeys } from './useKeys';

const keep = () => undefined;

/**
 * The bar under a terminal: the last line's note (the guardrail's ask or block), the key row,
 * then the line typed and sent with Enter, through the guardrail; an empty line sends Enter. A
 * letter typed while Ctrl is held is sent as that Ctrl key instead.
 */
export function TerminalBar({ id }: { id: string }) {
  const send = useSend(id, { onSent: keep, restorePhoto: keep });
  const keys = useKeys(id);
  const type = (next: string) => {
    const key = keys.ctrl ? ctrlKeyOf(send.draft, next) : undefined;
    if (key) keys.press([key]);
    else send.setDraft(next);
  };
  const submit = () => (send.draft.trim() ? send.submit(undefined) : keys.press(['Enter']));
  return (
    <View className="gap-2 border-t border-border bg-background px-3 py-2.5">
      <SendNote outcome={send.outcome} onSendAnyway={() => send.submit(undefined, true)} />
      {keys.error ? <ErrorNote text={keys.error} /> : null}
      <KeyRow ctrl={keys.ctrl} onCtrl={keys.toggleCtrl} onKey={(key) => keys.press([key])} />
      <View className="flex-row items-center gap-2">
        <Input
          value={send.draft}
          onChangeText={type}
          onSubmitEditing={submit}
          submitBehavior="submit"
          returnKeyType="send"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          placeholder="Type a command"
          accessibilityLabel="Command line"
          className="min-h-11 flex-1 rounded-3xl bg-card px-4 font-mono text-sm shadow-none"
        />
        <Button
          size="icon"
          className="rounded-full"
          onPress={submit}
          accessibilityLabel={send.draft.trim() ? 'Send the line' : 'Press Enter'}
        >
          <Icon as={ArrowUp} className="size-5 text-primary-foreground" />
        </Button>
      </View>
    </View>
  );
}
