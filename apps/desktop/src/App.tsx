import { useCommand } from './lib/useCommand';
import { DoctorScreen } from './screens/DoctorScreen';

export function App() {
  const { data: profile } = useCommand('profile.get');
  return (
    <main>
      <header>
        <h1 data-testid="app-name">Mesa</h1>
        <p data-testid="active-profile">Profile: {profile?.profile ?? '...'}</p>
        {/* ponytail: one screen, so no router; add one when the Board lands. */}
        <nav>
          <button type="button" aria-current="page">
            Doctor
          </button>
        </nav>
      </header>
      <DoctorScreen />
    </main>
  );
}
