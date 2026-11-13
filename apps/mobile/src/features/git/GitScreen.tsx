import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { View } from 'react-native';
import { BusyLine } from '@/components/BusyLine';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { BranchList } from './BranchList';
import { CommitForm } from './CommitForm';
import { StatusList } from './StatusList';
import { useGit } from './useGit';

/**
 * A session's checkout as source control: stage, commit, pull, push and switch branch. Nothing
 * here throws work away: discarding and forcing stay on the Mac.
 */
export function GitScreen({ id }: { id: string }) {
  const { status, branches, said, pending, run, writeMessage } = useGit(id);
  const busy = <BusyLine label="Asking your Mac..." />;
  return (
    <Screen className="gap-6">
      <Stack.Screen options={{ title: 'Source control' }} />
      {pending ? busy : said ? <Text variant="muted">{said}</Text> : null}
      <Section title="Changes">
        <Suspense fallback={busy}>
          <StatusList
            status={status}
            pending={pending}
            onStage={(path, staged) => run({ method: 'stage', id, path, staged })}
          />
        </Suspense>
      </Section>
      <Section title="Commit">
        <CommitForm
          pending={pending}
          onCommit={(message) => run({ method: 'commit', id, message })}
          write={writeMessage}
        />
      </Section>
      <Section title="Sync">
        <View className="flex-row gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={pending}
            onPress={() => run({ method: 'sync', id, action: 'pull' })}
          >
            <Text>Pull</Text>
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            disabled={pending}
            onPress={() => run({ method: 'sync', id, action: 'push' })}
          >
            <Text>Push</Text>
          </Button>
        </View>
      </Section>
      <Section title="Branch">
        <Suspense fallback={busy}>
          <BranchList
            branches={branches}
            pending={pending}
            onSwitch={(name) => run({ method: 'switch', id, name })}
          />
        </Suspense>
      </Section>
    </Screen>
  );
}
