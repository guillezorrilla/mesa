import type { PhoneConversation } from '@mesa/core/phone';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { useMac } from '../mac/useMac';

/**
 * A tap on a past conversation: its Mesa session when it is one; else, once the person confirms,
 * adopted and resumed in a Mesa window on the Mac (`mesa adopt`), and its session opened.
 */
export function useResume() {
  const link = useMac();
  const adopt = (c: PhoneConversation) =>
    link.call({ method: 'adopt', project: c.project, id: c.id }).then(
      ({ session }) => router.push(`/agents/${session}`),
      (error: Error) => Alert.alert('Could not resume it', error.message),
    );
  return (c: PhoneConversation) => {
    if (c.importedAs) return router.push(`/agents/${c.importedAs}`);
    if (c.elsewhere) return undefined;
    Alert.alert(
      'Resume this conversation?',
      'It reopens in a new Mesa window on your Mac. End it in its original terminal first: two agents writing one conversation can interleave it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Resume', onPress: () => void adopt(c) },
      ],
    );
  };
}
