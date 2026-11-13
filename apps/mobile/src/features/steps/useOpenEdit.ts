import { router } from 'expo-router';
import { Alert } from 'react-native';
import { useMac } from '../mac/useMac';

/**
 * Opens an edited file's diff in the diff viewer, its patch as the session's changes have it now;
 * resolves false when the file no longer differs from the base, so the row shows the edit itself.
 */
export function useOpenEdit(id: string) {
  const link = useMac();
  return (path: string): Promise<boolean> =>
    link.call({ method: 'changes', id }).then(
      ({ files }) => {
        // An edit outside the session's folder keeps its absolute path, which ends with the file's.
        const file = files.find((each) => each.path === path || path.endsWith(`/${each.path}`));
        if (!file) return false;
        router.push({ pathname: '/agents/diff', params: { id, path: file.path, rev: file.rev } });
        return true;
      },
      (error: Error) => {
        Alert.alert('Could not read the changes', error.message);
        return true;
      },
    );
}
