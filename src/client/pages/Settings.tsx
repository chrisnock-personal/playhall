import { saveSession, type Session } from '../api';
import { ChangePassword } from '../ChangePassword';
import { AppBar, ThemePicker } from '../AppBar';
import { DeviceSettings } from '../DeviceSettings';

export function Settings({ session, onSignOut }: { session: Session; onSignOut(): void }) {
  return (
    <div className="page">
      <AppBar session={session} onSignOut={onSignOut} active="settings" />
      <main className="settings-page">
        <h1>Settings</h1>
        <section className="settings-card" aria-labelledby="set-devices">
          <h2 id="set-devices">Microphone, speakers and camera</h2>
          <p className="muted">For voice and video in rooms. If you have more than one of any, choose which to use, and check them here before a game.</p>
          <DeviceSettings />
        </section>
        {!session.user.guest && (
          <section className="settings-card" aria-labelledby="set-password">
            <h2 id="set-password">Password</h2>
            <ChangePassword session={session} onChanged={(s) => { saveSession(s); }} />
          </section>
        )}
        <section className="settings-card" aria-labelledby="set-look">
          <h2 id="set-look">Appearance</h2>
          <ThemePicker />
        </section>
      </main>
    </div>
  );
}
