import { startTransition, useState } from 'react';
import { Switch, View } from 'react-native';
import { ChoiceChips } from '@/components/ChoiceChips';
import { ErrorNote } from '@/components/ErrorNote';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { SCHEDULES, type Schedule, scheduleCron } from './scheduleCron';
import { useAddRule } from './useAddRule';

/**
 * A schedule rule in one form: a name, a project, which days and when, the goal of the session it
 * opens, and whether it asks first. Saving adds it on the Mac; the scheduler runs it.
 */
export function RuleForm({ projects }: { projects: string[] }) {
  const [name, setName] = useState('');
  const [project, setProject] = useState(projects[0]);
  const [schedule, setSchedule] = useState<Schedule>('weekdays');
  const [time, setTime] = useState('09:00');
  const [goal, setGoal] = useState('');
  const [ask, setAsk] = useState(true);
  const [error, add, adding] = useAddRule();
  const cron = scheduleCron(schedule, time);
  const ready = Boolean(name.trim() && goal.trim() && project && cron);
  const save = () => {
    if (!project || !cron) return;
    startTransition(() => add({ name: name.trim(), project, cron, goal: goal.trim(), ask }));
  };
  return (
    <View className="gap-6">
      <FormField label="Name">
        <Input
          value={name}
          onChangeText={setName}
          accessibilityLabel="Name"
          placeholder="Morning triage"
          maxLength={80}
        />
      </FormField>
      <FormField label="Project">
        {projects.length ? (
          <ChoiceChips
            label="Project"
            choices={projects.map((each) => [each, each] as const)}
            value={project}
            onChange={setProject}
          />
        ) : (
          <Text variant="muted">Your Mac has no project yet.</Text>
        )}
      </FormField>
      <FormField
        label="When"
        hint={cron ? "On your Mac's clock." : 'Give a 24-hour time, such as 09:00.'}
      >
        <ChoiceChips label="Days" choices={SCHEDULES} value={schedule} onChange={setSchedule} />
        <Input
          value={time}
          onChangeText={setTime}
          accessibilityLabel="Time"
          keyboardType="numbers-and-punctuation"
          className="w-28 font-mono"
          maxLength={5}
        />
      </FormField>
      <FormField label="Open a session to">
        <Input
          value={goal}
          onChangeText={setGoal}
          accessibilityLabel="Goal"
          placeholder="Triage new issues and summarize them"
          multiline
          className="min-h-24"
          textAlignVertical="top"
        />
      </FormField>
      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="font-medium">Ask first</Text>
          <Text variant="muted">Each run waits for your approval, here or on the Mac.</Text>
        </View>
        <Switch value={ask} onValueChange={setAsk} accessibilityLabel="Ask first" />
      </View>
      {error ? <ErrorNote text={error} /> : null}
      <Button disabled={!ready || adding} onPress={save}>
        <Text>{adding ? 'Adding...' : 'Add rule'}</Text>
      </Button>
    </View>
  );
}
