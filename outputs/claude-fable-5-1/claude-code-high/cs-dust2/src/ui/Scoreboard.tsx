import type { Team } from '../game/weapons/WeaponDefs';
import { useHud } from './GameContext';

export function Scoreboard() {
  const hud = useHud();
  const teamRows = (team: Team) =>
    hud.players
      .filter((p) => p.team === team)
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
      .map((p) => (
        <tr key={p.id} className={(p.alive ? '' : 'dead') + (p.isPlayer ? ' me' : '')}>
          <td>
            {p.name}
            {p.isPlayer ? ' (you)' : ''}
            {p.hasC4 && <span className="c4tag">C4</span>}
          </td>
          <td>{p.kills}</td>
          <td>{p.deaths}</td>
          <td>${p.money}</td>
          <td>{p.alive ? 'alive' : 'dead'}</td>
        </tr>
      ));
  return (
    <div className="scoreboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span>
          Round {hud.roundNumber} · first to 13
        </span>
        <span>
          <span style={{ color: '#7ab8ff' }}>CT {hud.scoreCT}</span> : <span style={{ color: '#ffb45c' }}>{hud.scoreT} T</span>
        </span>
      </div>
      {(['CT', 'T'] as Team[]).map((team) => (
        <div key={team}>
          <div className={'team-title ' + team}>{team === 'CT' ? 'Counter-Terrorists' : 'Terrorists'}</div>
          <table>
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Player</th>
                <th>K</th>
                <th>D</th>
                <th>$</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>{teamRows(team)}</tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
