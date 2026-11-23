// The player's ladder (#50): which games are open, and how many wins until the next tier.
import type { MyProgression } from '../shared/progression';
import type { GameInfo } from './useGames';

export function LadderCard({ prog, games }: { prog: MyProgression; games: GameInfo[] }) {
  const p = prog.progress;
  if (!prog.on || !p) return null;
  const name = (id: string) => games.find((g) => g.id === id)?.name ?? id;
  const toGo = p.next === null ? 0 : Math.max(0, p.next - p.wins);
  return (
    <div className="card ladder-card">
      <h2>Your ladder</h2>
      {p.next === null
        ? <p>Every game is open. Well played!</p>
        : <>
          <p><strong>{toGo} more {toGo === 1 ? 'win' : 'wins'}</strong> in your open games to unlock tier {p.open + 1}.</p>
          <div className="ladder-bar" role="progressbar" aria-valuemin={0} aria-valuemax={p.next} aria-valuenow={p.wins}><span style={{ width: `${Math.min(100, (p.wins / p.next) * 100)}%` }} /></div>
          <p className="muted small">{p.wins} of {p.next} wins. Wins against computer players count too.</p>
        </>}
      <ol className="ladder-tiers">
        {prog.ladder.tiers.map((t, i) => (
          <li key={i} className={i < p.open ? 'open' : 'locked'}>
            <span className="ladder-tier">{i < p.open ? 'Tier' : '🔒 Tier'} {i + 1}</span>
            <span>{t.games.map(name).join(', ') || 'No games'}</span>
          </li>
        ))}
      </ol>
      <p className="muted small">You can watch any room, even for games you haven’t unlocked.</p>
    </div>
  );
}
