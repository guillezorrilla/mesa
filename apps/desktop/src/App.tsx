import {
  CircleHelp,
  FolderGit2,
  LayoutDashboard,
  type LucideIcon,
  ReceiptText,
  Stethoscope,
} from 'lucide-react';
import { useState } from 'react';
import { LogBox } from './components/LogBox';
import { ProfileSummary } from './components/ProfileSummary';
import { Button } from './components/ui/button';
import { useCommand } from './lib/useCommand';
import { cn } from './lib/utils';
import { BoardScreen } from './screens/board/BoardScreen';
import { DoctorScreen } from './screens/DoctorScreen';
import { HelpScreen } from './screens/HelpScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { ReceiptsScreen } from './screens/ReceiptsScreen';

const SCREENS: { name: string; icon: LucideIcon }[] = [
  { name: 'Board', icon: LayoutDashboard },
  { name: 'Projects', icon: FolderGit2 },
  { name: 'Receipts', icon: ReceiptText },
  { name: 'Doctor', icon: Stethoscope },
  { name: 'Help', icon: CircleHelp },
];

export function App() {
  const [screen, setScreen] = useState('Board');
  const doctor = useCommand('doctor.run');
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <h1 data-testid="app-name" className="font-mono font-semibold text-lg tracking-tight">
            Mesa
          </h1>
          {/* ponytail: five screens, so a button row instead of a router; add one past a handful. */}
          <nav className="flex items-center gap-1" aria-label="Screens">
            {SCREENS.map(({ name, icon: Icon }) => (
              <Button
                key={name}
                variant="ghost"
                size="sm"
                data-testid={`nav-${name.toLowerCase()}`}
                aria-current={screen === name ? 'page' : undefined}
                className={cn(screen === name && 'bg-accent text-accent-foreground')}
                onClick={() => setScreen(name)}
              >
                <Icon aria-hidden />
                {name}
              </Button>
            ))}
          </nav>
          <div className="ml-auto">
            <LogBox />
          </div>
        </div>
        <div className="border-t px-6 py-1.5">
          <ProfileSummary doctor={doctor.data} />
        </div>
      </header>
      <main className="flex-1 px-6 py-5">
        {screen === 'Board' && <BoardScreen />}
        {screen === 'Projects' && <ProjectsScreen />}
        {screen === 'Receipts' && <ReceiptsScreen />}
        {screen === 'Doctor' && <DoctorScreen doctor={doctor} />}
        {screen === 'Help' && <HelpScreen />}
      </main>
    </div>
  );
}
