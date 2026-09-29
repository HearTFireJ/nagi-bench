import { useState } from 'react';
import type { Team } from '../game/types';
import { useEngine, useHud } from './EngineContext';
import { ControlsHelp } from './Overlays';

const DIFFICULTIES = [
  { label: '简单', value: 0.3 },
  { label: '普通', value: 0.5 },
  { label: '困难', value: 0.72 },
];

/** Start screen: the bot-only match keeps running behind it as a live fly-over of Dust2. */
export const MainMenu = () => {
  const engine = useEngine();
  const screen = useHud((h) => h.screen);
  const [team, setTeam] = useState<Team>('CT');
  const [pistol, setPistol] = useState(true);
  const [difficulty, setDifficulty] = useState(0.5);
  const [sens, setSens] = useState(1);
  const [volume, setVolume] = useState(0.7);
  if (screen !== 'menu') return null;

  return (
    <div className="overlay menu">
      <div className="menu-card">
        <div className="title">
          <span>DUST2</span>
          <small>5v5 · 第一人称射击原型</small>
        </div>

        <div className="field">
          <label>选择阵营</label>
          <div className="seg">
            <button className={'ct' + (team === 'CT' ? ' on' : '')} onClick={() => setTeam('CT')}>
              反恐精英 CT
              <small>默认 USP-S · 守点 / 拆包</small>
            </button>
            <button className={'t' + (team === 'T' ? ' on' : '')} onClick={() => setTeam('T')}>
              恐怖分子 T
              <small>默认 Glock-18 · 下包</small>
            </button>
          </div>
        </div>

        <div className="field">
          <label>开局模式</label>
          <div className="seg">
            <button className={pistol ? 'on' : ''} onClick={() => setPistol(true)}>
              手枪局
              <small>只带默认手枪，无主武器，无护甲，不可购买</small>
            </button>
            <button className={!pistol ? 'on' : ''} onClick={() => setPistol(false)}>
              全装局
              <small>步枪 + 护甲，可用 B 购买</small>
            </button>
          </div>
        </div>

        <div className="field inline">
          <label>Bot 难度</label>
          <div className="seg small">
            {DIFFICULTIES.map((d) => (
              <button key={d.label} className={difficulty === d.value ? 'on' : ''} onClick={() => setDifficulty(d.value)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field inline">
          <label>鼠标灵敏度 {sens.toFixed(1)}</label>
          <input type="range" min={0.2} max={3} step={0.1} value={sens} onChange={(e) => setSens(Number(e.target.value))} />
        </div>
        <div className="field inline">
          <label>音量 {Math.round(volume * 100)}%</label>
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
        </div>

        <button
          className="btn primary big"
          onClick={() => engine.startMatch({ team, pistolRound: pistol, difficulty }, { sensitivity: sens, volume })}
        >
          开始游戏（点击后将锁定鼠标）
        </button>
        <ControlsHelp />
      </div>
    </div>
  );
};
