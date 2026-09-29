import { useState } from 'react';
import type { Difficulty, GameConfig } from '../core/game/game.ts';
import type { Team } from '../core/map/types.ts';

interface Props {
  onStart: (cfg: Partial<GameConfig>) => void;
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string, string?][]; onChange: (v: T) => void }): JSX.Element {
  return (
    <div className="choice">
      {options.map(([v, label, sub]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          <span>{label}</span>
          {sub && <small>{sub}</small>}
        </button>
      ))}
    </div>
  );
}

export function Menu({ onStart }: Props): JSX.Element {
  const [team, setTeam] = useState<Team>('CT');
  const [mode, setMode] = useState<'pistol' | 'fullbuy'>('pistol');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');

  return (
    <div className="menu">
      <div className="menu-card">
        <div className="logo">
          <span>DUST</span>
          <b>2</b>
        </div>
        <p className="tagline">5v5 第一人称战术射击原型 · React + TypeScript + three.js · 零外部资源</p>

        <h3>阵营</h3>
        <Choice<Team>
          value={team}
          onChange={setTeam}
          options={[
            ['CT', '反恐精英 CT', '防守 · 拆除 C4'],
            ['T', '恐怖分子 T', '进攻 · 安放 C4'],
          ]}
        />

        <h3>开局</h3>
        <Choice<'pistol' | 'fullbuy'>
          value={mode}
          onChange={setMode}
          options={[
            ['pistol', '手枪局', '仅默认手枪 · 无护甲 · 之后进入经济回合'],
            ['fullbuy', '全装局', '步枪 + 护甲 + 头盔 · 资金充足'],
          ]}
        />

        <h3>AI 难度</h3>
        <Choice<Difficulty>
          value={difficulty}
          onChange={setDifficulty}
          options={[
            ['easy', '简单'],
            ['normal', '普通'],
            ['hard', '困难'],
          ]}
        />

        <button className="primary big" onClick={() => onStart({ playerTeam: team, mode, difficulty, seed: Math.floor(Math.random() * 1e9) })}>
          开始比赛
        </button>
        <p className="foot">点击游戏画面后鼠标会被锁定，按 Esc 可随时暂停。先赢 8 回合者获胜。</p>
      </div>
    </div>
  );
}
