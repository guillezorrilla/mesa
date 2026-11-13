import UserCheck from 'lucide-react-native/icons/user-check';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAssign } from './useAssign';

/** Assign to me, confirmed first, until it is done; a refusal says why. */
export function AssignButton({ id, name, site }: { id: string; name: string; site?: string }) {
  const { assigned, assign, assigning } = useAssign(id, name, site);
  if (assigned.assignee)
    return (
      <Text accessibilityRole="alert" className="text-state-done">
        Assigned to {assigned.assignee}.
      </Text>
    );
  return (
    <>
      <Button variant="outline" onPress={assign} disabled={assigning} className="rounded-full">
        <Icon as={UserCheck} className="size-4 text-foreground" />
        <Text>{assigning ? 'Assigning...' : 'Assign to me'}</Text>
      </Button>
      {assigned.error ? <ErrorNote text={assigned.error} /> : null}
    </>
  );
}
