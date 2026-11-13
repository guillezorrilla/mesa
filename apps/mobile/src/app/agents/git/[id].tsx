import { useLocalSearchParams } from 'expo-router';
import { GitScreen } from '@/features/git/GitScreen';

/** A session's checkout as source control, `/agents/git/<id>`. */
export default function Git() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GitScreen id={id} />;
}
