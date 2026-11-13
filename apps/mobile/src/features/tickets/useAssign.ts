import { startTransition, useActionState } from 'react';
import { Alert } from 'react-native';
import { useMac } from '../mac/useMac';

export type Assigned = { assignee?: string; error?: string };

/**
 * Assigning ticket `id` (`name`, as the person reads it) to them once they confirm, as an
 * action: Mesa's one write to its tracker.
 */
export function useAssign(id: string, name: string, site?: string) {
  const link = useMac();
  const [assigned, dispatch, assigning] = useActionState(
    (): Promise<Assigned> =>
      link.call({ method: 'assign', id, ...(site ? { site } : {}) }).then(
        ({ assignee }) => ({ assignee }),
        (error: Error) => ({ error: error.message }),
      ),
    {},
  );
  const assign = () =>
    Alert.alert(`Assign ${name} to you?`, 'Your tracker shows you as its assignee.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Assign', onPress: () => startTransition(dispatch) },
    ]);
  return { assigned, assign, assigning };
}
