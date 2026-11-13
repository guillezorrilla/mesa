import { router } from 'expo-router';
import { Alert } from 'react-native';
import { useMac } from '../mac/useMac';

/**
 * Opens an edited file's diff in the diff viewer: its patch as the session's changes have it now,
 * or says why not when the file no longer differs from the base.
 */
export function useOpenEdit(id: string) {
  const link = useMac();
  return (path: string) =>
    link.call({ method: 'changes', id }).then(
      ({ files }) => {
        const file = files.find((each) => each.path === path);
        if (!file)
          return Alert.alert('No change to show', `${path} has no change against the base now.`);
        router.push({ pathname: '/agents/diff', params: { id, path, rev: file.rev } });
      },
      (error: Error) => Alert.alert('Could not read the changes', error.message),
    );
}
