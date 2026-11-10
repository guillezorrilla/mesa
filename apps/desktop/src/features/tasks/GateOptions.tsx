import type { Gate } from '@mesa/core';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useCall } from '@/lib/useCommand';

/**
 * One button per option of an open decision gate (CONTEXT.md, Decision gate), named by its
 * question: a click resolves it as `mesa gates resolve` does, the app being a person outside any
 * Mesa window. `onDone` gets a refused resolve's reason (resolved elsewhere first), to show where
 * it outlives the gate, and reads the list again; the buttons stay off until it has.
 */
export function GateOptions(props: {
  gate: Pick<Gate, 'id' | 'options' | 'question'>;
  onDone: (refused?: string) => Promise<unknown>;
}) {
  const call = useCall();
  const { acting, act } = useAct();
  const resolve = (option: string) =>
    act(async () => {
      const resolved = await call('gates.resolve', { id: props.gate.id, option });
      await props.onDone(resolved.ok ? undefined : resolved.error.message);
      return undefined;
    });
  return (
    <fieldset className="flex flex-wrap gap-1.5" aria-label={props.gate.question}>
      {props.gate.options.map((option) => (
        <Button
          key={option}
          size="xs"
          variant="outline"
          disabled={acting}
          onClick={() => void resolve(option)}
        >
          {option}
        </Button>
      ))}
    </fieldset>
  );
}
