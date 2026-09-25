import { useState } from 'react';
import { LogBox } from './components/LogBox';
import { ProfileSummary } from './components/ProfileSummary';
import { useCommand } from './lib/useCommand';
import { DoctorScreen } from './screens/DoctorScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { ReceiptsScreen } from './screens/ReceiptsScreen';
import { SessionsScreen } from './screens/SessionsScreen';

const SCREENS = ['Projects', 'Sessions', 'Receipts', 'Doctor'] as const;

export function App() {
  const [screen, setScreen] = useState<(typeof SCREENS)[number]>('Projects');
  const doctor = useCommand('doctor.run');
  return (
    <main>
      <header>
        <h1 data-testid="app-name">Mesa</h1>
        <ProfileSummary doctor={doctor.data} />
        <LogBox />
        {/* ponytail: four screens, so a button row instead of a router; add one when the Board lands. */}
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
      {screen === 'Projects' && <ProjectsScreen />}
      {screen === 'Sessions' && <SessionsScreen />}
      {screen === 'Receipts' && <ReceiptsScreen />}
      {screen === 'Doctor' && <DoctorScreen doctor={doctor} />}
    </main>
  );
}
