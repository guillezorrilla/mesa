import type { PhoneRow, SessionAction } from '@mesa/core/phone';
import { useRouter } from 'expo-router';
import { ActionSheetIOS, Alert } from 'react-native';
import { useMac } from '../mac/useMac';
import { ACTION_WORDS, CONFIRMED, confirmText, menuActions } from './menuActions';

/** What an action needs from the person first: a name to rename to, or a handoff note. */
const ASKS: Partial<Record<SessionAction, { title: string; message: string }>> = {
  rename: { title: 'Rename', message: 'The name the Board shows in place of its id.' },
  handoff: {
    title: 'Hand off',
    message: 'The note the successor reads first: what is done, what is left.',
  },
};

/**
 * The session menu for `row` (`archived` as the Mac says): iOS's action sheet of what fits its
 * state, a confirmation before stop and archive, a prompt for a name or a handoff note, then the
 * action through the Mac. A resume, fork or handoff opens the session it started; `onDone` reads
 * this one again.
 */
export function useSessionActions(row: PhoneRow, archived: boolean, onDone: () => void) {
  const link = useMac();
  const router = useRouter();
  const run = (action: SessionAction, text?: string) =>
    link.call({ method: 'act', id: row.id, action, ...(text ? { text } : {}) }).then(
      ({ session }) => {
        if (session) router.push(`/agents/${session}`);
        onDone();
      },
      (error: Error) =>
        Alert.alert(`Could not ${ACTION_WORDS[action].toLowerCase()}`, error.message),
    );
  const choose = (action: SessionAction) => {
    const ask = ASKS[action];
    if (ask)
      return Alert.prompt(
        ask.title,
        ask.message,
        (text) => text.trim() && run(action, text.trim()),
      );
    if (!CONFIRMED.has(action)) return run(action);
    Alert.alert(ACTION_WORDS[action], confirmText(action, row.title, row.terminal), [
      { text: 'Cancel', style: 'cancel' },
      { text: ACTION_WORDS[action], style: 'destructive', onPress: () => run(action) },
    ]);
  };
  const open = () => {
    const actions = menuActions(row.state, archived, row.terminal);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...actions.map((a) => ACTION_WORDS[a]), 'Cancel'],
        cancelButtonIndex: actions.length,
        destructiveButtonIndex: actions.flatMap((a, i) => (CONFIRMED.has(a) ? [i] : [])),
      },
      (index) => {
        const action = actions[index];
        if (action) choose(action);
      },
    );
  };
  return open;
}
