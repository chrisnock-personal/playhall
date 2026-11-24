import type { FC } from 'react';
import type { HowToPlay as Rules } from '../shared/game';

/** A game's rules, as shown in the room's How to play tab and the lobby; with
 *  pictures drawn by the game's own pieces where it has them (#57), by section title. */
export function HowToPlay({ rules, pictures }: { rules: Rules | undefined; pictures?: Record<string, FC> }) {
  if (!rules) return <p className="empty">No rules written for this game yet.</p>;
  return (
    <div className="how-to-play">
      <p className="goal">{rules.goal}</p>
      {rules.sections.map((s) => (
        <section key={s.title}>
          <h3>{s.title}</h3>
          {pictures?.[s.title] && (() => { const Picture = pictures[s.title]; return <figure className="rules-picture"><Picture /></figure>; })()}
          <ul>{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
        </section>
      ))}
    </div>
  );
}
