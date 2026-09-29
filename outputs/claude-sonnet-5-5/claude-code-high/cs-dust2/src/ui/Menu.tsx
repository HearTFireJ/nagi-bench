import { useState } from 'react';
import { CFG, ROUND_MODES } from '../sim/config.ts';
import type { RoundMode } from '../sim/config.ts';
import type { Team } from '../sim/map.ts';
import { runtime } from '../runtime/runtime.ts';

const KEYS: [string, string][] = [
  ['W A S D', '移动'],
  ['Shift', '静步（无脚步声）'],
  ['空格', '跳跃（可跳上矮箱子）'],
  ['鼠标', '转视角 / 左键开火'],
  ['右键', 'AWP 开镜（再点切换倍率）/ 刀重刺'],
  ['R', '换弹'],
  ['1 / 2 / 3', '主武器 / 副武器 / 刀 ；Q 切回上一把 ；滚轮切换'],
  ['E（按住）', 'T 在 A/B 点安放 C4 ；CT 在 C4 旁拆除'],
  ['B', '冻结时间打开购买菜单，数字键购买'],
  ['Tab', '记分板'],
  ['阵亡后', '点击切换观战队友 ；F 接管该队友（bot）'],
  ['Esc', '释放鼠标 / 暂停'],
];

export function Menu() {
  const [team, setTeam] = useState<Team>('CT');
  const [mode, setMode] = useState<RoundMode>('pistol');

  return (
    <div className="menu">
      <div className="menu-card">
        <h1>
          DUST<span>2</span> · 5v5
        </h1>
        <p className="sub">第一人称射击原型 · React + TypeScript + three.js · 全程序化生成（无外部资产）</p>

        <div className="row">
          <div className="col">
            <h3>选择阵营</h3>
            <div className="choice">
              <button className={'card ct' + (team === 'CT' ? ' on' : '')} onClick={() => setTeam('CT')}>
                <b>反恐精英 CT</b>
                <small>守点 · 默认 USP-S · 你 + 4 名 AI 队友</small>
              </button>
              <button className={'card t' + (team === 'T' ? ' on' : '')} onClick={() => setTeam('T')}>
                <b>恐怖分子 T</b>
                <small>进攻 · 默认 Glock-18 · 可能携带 C4</small>
              </button>
            </div>
            <h3>开局模式</h3>
            <div className="choice">
              {(Object.keys(ROUND_MODES) as RoundMode[]).map((m) => (
                <button key={m} className={'card' + (mode === m ? ' on' : '')} onClick={() => setMode(m)}>
                  <b>{ROUND_MODES[m].label}</b>
                  <small>{ROUND_MODES[m].desc}</small>
                </button>
              ))}
            </div>
            <button
              className="start"
              onClick={() => runtime.startMatch({ team, mode, winRounds: CFG.WIN_ROUNDS })}
            >
              开始游戏（先到 {CFG.WIN_ROUNDS} 回合获胜）
            </button>
          </div>
          <div className="col">
            <h3>操作</h3>
            <table className="keys">
              <tbody>
                {KEYS.map(([k, v]) => (
                  <tr key={k}>
                    <td>
                      <kbd>{k}</kbd>
                    </td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
