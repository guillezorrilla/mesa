import { useLocalSearchParams } from 'expo-router';
import { GateScreen } from '@/features/gates/GateScreen';

/** One decision gate, `/agents/gates/<id>`: from Needs you, or a task the gate holds. */
export default function Gate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GateScreen id={id} />;
}
