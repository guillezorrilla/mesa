import type { PhoneCrew } from '@mesa/core/phone';
import { use } from 'react';
import { View } from 'react-native';
import { Section } from '@/components/Section';
import { taskColor, taskOrder, taskWords } from './crewText';
import { TaskRow } from './TaskRow';
import { WorkerRow } from './WorkerRow';

/** A coordinator's workers and task graph; nothing for a session with neither. */
export function CrewBody({ read }: { read: Promise<PhoneCrew | undefined> }) {
  const crew = use(read);
  if (!crew) return null;
  return (
    <>
      {crew.workers.length ? (
        <Section title="Crew">
          {crew.workers.map((worker) => (
            <WorkerRow key={worker.id} worker={worker} />
          ))}
        </Section>
      ) : null}
      {crew.tasks.length ? (
        <Section title="Tasks">
          <View className="rounded-xl border border-border px-3">
            {taskOrder(crew.tasks).map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                color={taskColor(task.state)}
                words={taskWords(task, crew)}
                first={index === 0}
              />
            ))}
          </View>
        </Section>
      ) : null}
    </>
  );
}
