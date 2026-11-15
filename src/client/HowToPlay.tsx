import type { HowToPlay as Rules } from '../shared/game';

/** A game's rules, as shown in the room's How to play tab and the lobby. */
export function HowToPlay({ rules }: { rules: Rules | undefined }) {
  if (!rules) return <p className="empty">No rules written for this game yet.</p>;
  return (
    <div className="how-to-play">
      <p className="goal">{rules.goal}</p>
      {rules.sections.map((s) => (
        <section key={s.title}>
          <h3>{s.title}</h3>
          <ul>{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
        </section>
      ))}
    </div>
  );
}
