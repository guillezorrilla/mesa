import { useState } from 'react';
import { LogBox } from './components/LogBox';
import { ProfileSummary } from './components/ProfileSummary';
import { useCommand } from './lib/useCommand';
import { BoardScreen } from './screens/BoardScreen';
import { DoctorScreen } from './screens/DoctorScreen';
import { HelpScreen } from './screens/HelpScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { ReceiptsScreen } from './screens/ReceiptsScreen';

const SCREENS = ['Board', 'Projects', 'Receipts', 'Doctor', 'Help'] as const;

export function App() {
  const [screen, setScreen] = useState<(typeof SCREENS)[number]>('Board');
  const doctor = useCommand('doctor.run');
  return (
    <main>
      <header>
        <h1 data-testid="app-name">Mesa</h1>
        <ProfileSummary doctor={doctor.data} />
        <LogBox />
        {/* ponytail: five screens, so a button row instead of a router; add one past a handful. */}
        <nav>
          {SCREENS.map((name) => (
            <button
              key={name}
              type="button"
              data-testid={`nav-${name.toLowerCase()}`}
              aria-current={screen === name ? 'page' : undefined}
              onClick={() => setScreen(name)}
            >
              {name}
            </button>
          ))}
        </nav>
      </header>
      {screen === 'Board' && <BoardScreen />}
      {screen === 'Projects' && <ProjectsScreen />}
      {screen === 'Receipts' && <ReceiptsScreen />}
      {screen === 'Doctor' && <DoctorScreen doctor={doctor} />}
      {screen === 'Help' && <HelpScreen />}
    </main>
  );
}
