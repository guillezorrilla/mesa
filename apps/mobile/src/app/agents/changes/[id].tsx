import { useLocalSearchParams } from 'expo-router';
import { ChangesScreen } from '@/features/changes/ChangesScreen';

/** A session's changed files, `/agents/changes/<id>`. */
export default function Changes() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChangesScreen id={id} />;
}
