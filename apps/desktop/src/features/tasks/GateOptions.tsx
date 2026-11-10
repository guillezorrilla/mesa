import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCall } from '@/lib/useCommand';

/**
 * One button per option of an open decision gate (CONTEXT.md, Decision gate): a click resolves it
 * as `mesa gates resolve` does, the app being a person outside any Mesa window. `onDone` gets a
 * refused resolve's reason (resolved elsewhere first), to show where it outlives the gate, and
 * reads the list again.
 */
export function GateOptions(props: {
  gate: { id: string; options: string[] };
  onDone: (refused?: string) => Promise<unknown>;
}) {
  const call = useCall();
  const [resolving, setResolving] = useState(false);
  const resolve = async (option: string) => {
    setResolving(true);
    const resolved = await call('gates.resolve', { id: props.gate.id, option });
    setResolving(false);
    await props.onDone(resolved.ok ? undefined : resolved.error.message);
  };
  return (
    <fieldset className="flex flex-wrap gap-1.5" aria-label={`Options for gate ${props.gate.id}`}>
      {props.gate.options.map((option) => (
        <Button
          key={option}
          size="xs"
          variant="outline"
          disabled={resolving}
          onClick={() => void resolve(option)}
        >
          {option}
        </Button>
      ))}
    </fieldset>
  );
}
