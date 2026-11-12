import { useLocalSearchParams } from 'expo-router';
import { SessionScreen } from '@/features/sessions/SessionScreen';

/** One session, `/agents/<id>`: from a row, or from a push. */
export default function Session() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionScreen id={id} />;
}
