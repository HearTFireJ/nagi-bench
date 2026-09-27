import { useHud } from './GameContext';

export function Killfeed() {
  const hud = useHud();
  const myName = hud.me.name;
  return (
    <div className="killfeed">
      {hud.killfeed.map((k) => (
        <div key={k.id} className={'entry' + (k.killer === myName || k.victim === myName ? ' involves-me' : '')}>
          {k.killer && <span className={'name ' + k.killerTeam}>{k.killer}</span>}
          <span className="weapon">{k.weapon}</span>
          {k.headshot && <span className="hs">HS</span>}
          <span className={'name ' + k.victimTeam}>{k.victim}</span>
        </div>
      ))}
    </div>
  );
}
