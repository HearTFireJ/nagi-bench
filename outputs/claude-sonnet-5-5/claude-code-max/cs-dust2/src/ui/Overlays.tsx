import { useEffect, useRef } from 'react';
import { buyOptions } from '../engine/hudState';
import { useEngine, useHud } from './EngineContext';

/** Key reference shown in the menu and the pause screen. */
export const ControlsHelp = () => (
  <div className="controls-help">
    <div>
      <kbd>W</kbd>
      <kbd>A</kbd>
      <kbd>S</kbd>
      <kbd>D</kbd> 移动 · <kbd>空格</kbd> 跳跃 · <kbd>Shift</kbd> 静步
    </div>
    <div>
      鼠标 视角 · 左键 开火 · 右键 AWP 开镜（再按切换倍率，第三次取消）· <kbd>R</kbd> 换弹
    </div>
    <div>
      <kbd>1</kbd> 主武器 · <kbd>2</kbd> 手枪 · <kbd>3</kbd> 刀 · <kbd>5</kbd> C4 · <kbd>Q</kbd> 上一把 · 滚轮 切枪 · <kbd>G</kbd> 丢弃
    </div>
    <div>
      <kbd>E</kbd> 按住 安放 / 拆除 C4、拾取武器 · <kbd>B</kbd> 购买（准备阶段）· <kbd>Tab</kbd> 计分板
    </div>
    <div>
      阵亡后：<kbd>←</kbd>
      <kbd>→</kbd> 切换观战 · <kbd>F</kbd> 接管存活队友（bot）
    </div>
  </div>
);

export const BuyMenu = () => {
  const engine = useEngine();
  const open = useHud((h) => h.buyOpen);
  const money = useHud((h) => h.money);
  const team = useHud((h) => h.viewTeam);
  const slots = useHud((h) => h.slots);
  const armor = useHud((h) => h.armor);
  const helmet = useHud((h) => h.helmet);
  if (!open) return null;
  return (
    <div className="buymenu">
      <h2>
        购买菜单 <small>按数字键购买 · B 关闭</small>
      </h2>
      <div className="buy-money">$ {money}</div>
      {buyOptions(team).map((o) => {
        const owned = o.item === 'kevlar' ? armor >= 100 : o.item === 'kevlar_helmet' ? armor >= 100 && helmet : slots.some((s) => s.id === o.item);
        const disabled = owned || money < o.price;
        return (
          <button key={o.key} className={'buy-opt' + (disabled ? ' disabled' : '')} disabled={disabled} onClick={() => engine.buyItem(o.key)}>
            <kbd>{o.key}</kbd>
            <span className="bn">{o.label}</span>
            <em>{owned ? '已拥有' : '$' + o.price}</em>
          </button>
        );
      })}
    </div>
  );
};

export const Scoreboard = () => {
  const open = useHud((h) => h.scoreboardOpen || h.screen === 'matchEnd');
  const rows = useHud((h) => h.scoreboard);
  const scoreT = useHud((h) => h.scoreT);
  const scoreCT = useHud((h) => h.scoreCT);
  const round = useHud((h) => h.round);
  if (!open) return null;
  const table = (team: 'CT' | 'T') => (
    <table className={'sb-table ' + team}>
      <thead>
        <tr>
          <th className="l">{team === 'CT' ? '反恐精英' : '恐怖分子'}</th>
          <th>击杀</th>
          <th>死亡</th>
          <th>得分</th>
          <th>金钱</th>
        </tr>
      </thead>
      <tbody>
        {rows
          .filter((r) => r.team === team)
          .map((r) => (
            <tr key={r.id} className={(r.alive ? '' : 'dead ') + (r.isPlayer ? 'me' : '')}>
              <td className="l">
                {r.name}
                {r.hasBomb ? ' · C4' : ''}
              </td>
              <td>{r.kills}</td>
              <td>{r.deaths}</td>
              <td>{r.score}</td>
              <td>{r.money >= 0 ? '$' + r.money : ''}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
  return (
    <div className="scoreboard">
      <h2>
        第 {round} 回合 · CT {scoreCT} : {scoreT} T
      </h2>
      {table('CT')}
      {table('T')}
    </div>
  );
};

export const PauseOverlay = () => {
  const engine = useEngine();
  const screen = useHud((h) => h.screen);
  if (screen !== 'paused') return null;
  return (
    <div className="overlay pause" onClick={() => engine.resume()}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h1>游戏已暂停</h1>
        <p>模拟已冻结。点击继续游戏（会重新锁定鼠标）。</p>
        <button className="btn primary" onClick={() => engine.resume()}>
          继续
        </button>
        <button className="btn" onClick={() => engine.returnToMenu()}>
          返回主菜单
        </button>
        <ControlsHelp />
      </div>
    </div>
  );
};

export const MatchEndOverlay = () => {
  const engine = useEngine();
  const screen = useHud((h) => h.screen);
  const winner = useHud((h) => h.matchWinner);
  const team = useHud((h) => h.playerTeam);
  if (screen !== 'matchEnd') return null;
  const won = winner === team;
  return (
    <div className="overlay matchend">
      <div className="panel">
        <h1 className={won ? 'win' : 'lose'}>{won ? '比赛胜利！' : '比赛失败'}</h1>
        <p>{winner === 'CT' ? '反恐精英' : '恐怖分子'}赢得了比赛</p>
        <div className="row">
          <button className="btn primary" onClick={() => engine.restartMatch()}>
            再来一局
          </button>
          <button className="btn" onClick={() => engine.returnToMenu()}>
            返回主菜单
          </button>
        </div>
      </div>
    </div>
  );
};

/** Red edge indicator pointing toward whoever shot you, plus a brief red vignette. Driven by ui$ events, not React state. */
export const DamageIndicator = () => {
  const engine = useEngine();
  const arc = useRef<HTMLDivElement>(null);
  const vig = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      engine.ui$.on((e) => {
        if (e.type !== 'damage') return;
        const a = arc.current;
        const v = vig.current;
        if (a) {
          a.style.transform = 'rotate(' + ((e.angle * 180) / Math.PI).toFixed(1) + 'deg)';
          a.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 950, easing: 'ease-out', fill: 'forwards' });
        }
        if (v) v.animate([{ opacity: Math.min(0.65, 0.2 + e.amount / 90) }, { opacity: 0 }], { duration: 650, easing: 'ease-out', fill: 'forwards' });
      }),
    [engine],
  );
  return (
    <>
      <div ref={vig} className="dmg-vignette" />
      <div className="dmg-ring">
        <div ref={arc} className="dmg-arc" />
      </div>
    </>
  );
};

/** The white X flashed on the crosshair when you hit somebody (red on headshots / kills). */
export const HitMarker = () => {
  const engine = useEngine();
  const el = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      engine.ui$.on((e) => {
        if (e.type !== 'hitmarker' || !el.current) return;
        const node = el.current;
        node.className = 'hitmarker' + (e.killed ? ' kill' : e.headshot ? ' head' : '');
        node.animate([{ opacity: 1, transform: 'translate(-50%,-50%) scale(1.25)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1)' }], { duration: e.killed ? 420 : 260, easing: 'ease-out', fill: 'forwards' });
      }),
    [engine],
  );
  return (
    <div ref={el} className="hitmarker">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
};
