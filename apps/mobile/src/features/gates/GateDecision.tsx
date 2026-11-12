import type { GateAdvice } from '@mesa/core/phone';
import { ErrorNote } from '@/components/ErrorNote';
import { Text } from '@/components/ui/text';
import { GateOptions } from './GateOptions';
import { useResolveGate } from './useResolveGate';

/** A gate's options until the person picks one, then what they picked; a refusal says why. */
export function GateDecision({
  id,
  options,
  advice,
}: {
  id: string;
  options: readonly string[];
  advice: GateAdvice;
}) {
  const [resolved, resolve, resolving] = useResolveGate(id);
  return (
    <>
      {resolved.picked ? (
        <Text accessibilityRole="alert" className="text-state-done">
          You picked {resolved.picked}. Its coordinator hears it, and the task goes on.
        </Text>
      ) : (
        <GateOptions options={options} advice={advice} busy={resolving} onPick={resolve} />
      )}
      {resolved.error ? <ErrorNote text={resolved.error} /> : null}
    </>
  );
}
