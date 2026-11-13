import { useLocalSearchParams } from 'expo-router';
import { PrDiffScreen } from '@/features/prs/PrDiffScreen';

/** One file of a pull request's diff, `/work/pr-diff?project=&number=&path=&rev=`. */
export default function PrDiff() {
  const { project, number, path, rev } = useLocalSearchParams<{
    project: string;
    number: string;
    path: string;
    rev: string;
  }>();
  return <PrDiffScreen project={project} number={Number(number)} path={path} rev={rev} />;
}
