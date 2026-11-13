import { useLocalSearchParams } from 'expo-router';
import { PrScreen } from '@/features/prs/PrScreen';

/** One pull request, `/work/pr?project=<project>&number=<n>`. */
export default function Pr() {
  const { project, number } = useLocalSearchParams<{ project: string; number: string }>();
  return <PrScreen project={project} number={Number(number)} />;
}
