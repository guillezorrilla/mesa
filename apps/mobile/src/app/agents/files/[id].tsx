import { useLocalSearchParams } from 'expo-router';
import { FilesScreen } from '@/features/files/FilesScreen';

/** A session's worktree to browse, `/agents/files/<id>`. */
export default function Files() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FilesScreen id={id} />;
}
