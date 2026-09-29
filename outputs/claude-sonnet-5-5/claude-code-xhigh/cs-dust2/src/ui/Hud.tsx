import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { HudState } from '../app/hudStore.ts';
import { SessionContext, useHud, useSession } from './context.ts';
import type { GameSession } from '../app/session.ts';

// ---------------------------------------------------------------------------------------------
// Crosshair: the gap follows the live weapon inaccuracy. Updated imperatively every frame.
// ---------------------------------------------------------------------------------------------
function Crosshair(): JSX.Element | null {
  const session = useSession();
  const hud = useHud();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    return session.onFrame((f) => {
      const el = ref.current;
      if (el) el.style.setProperty('--gap', `${Math.min(140, 3 + f.spreadPx).toFixed(1)}px`);
    });
  }, [session]);
  if (!hud.alive || hud.scope > 0 || hud.paused) return null;
  const knife = hud.weapon.ammoless;
  return (
    <div ref={ref} className={`crosshair${knife ? ' knife' : ''}`}>
      <i className="t" />
      <i className="b" />
      <i className="l" />
      <i className="r" />
      <i className="dot" />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// AWP scope: black mask with a circular lens, reticle and mil-dots
// ---------------------------------------------------------------------------------------------
function Scope({ hud }: { hud: HudState }): JSX.Element | null {
  if (!hud.alive || hud.scope <= 0) return null;
  const ticks = [-3, -2, -1, 1, 2, 3];
  return (
    <div className={`scope level-${hud.scope}`}>
      <div className="scope-ring" />
      <div className="scope-h" />
      <div className="scope-v" />
      {ticks.map((t) => (
        <i key={`h${t}`} className="mil h" style={{ left: `calc(50% + ${t * 4.2}vmin)` }} />
      ))}
      {ticks.map((t) => (
        <i key={`v${t}`} className="mil v" style={{ top: `calc(50% + ${t * 4.2}vmin)` }} />
      ))}
      <div className="scope-dot" />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function Status({ hud }: { hud: HudState }): JSX.Element {
  const hpClass = hud.health <= 25 ? 'low' : '';
  return (
    <div className="status">
      <div className="zone">{hud.spectating ? `观战 · ${hud.zone}` : hud.zone}</div>
      <div className="bars">
        <div className={`stat hp ${hpClass}`}>
          <span className="ico">✚</span>
          <b>{hud.health}</b>
          <div className="bar">
            <div style={{ width: `${hud.health}%` }} />
          </div>
        </div>
        <div className="stat armor">
          <span className="ico">{hud.helmet ? '⛑' : '◈'}</span>
          <b>{hud.armor}</b>
          <div className="bar">
            <div style={{ width: `${hud.armor}%` }} />
          </div>
        </div>
      </div>
      <div className="misc">
        <span className="money">${hud.money}</span>
        {hud.kit && <span className="tag">拆弹器</span>}
        {hud.hasBomb && <span className="tag bomb">C4</span>}
      </div>
    </div>
  );
}

function AmmoPanel({ hud }: { hud: HudState }): JSX.Element {
  const w = hud.weapon;
  const low = !w.ammoless && w.mag <= 5;
  return (
    <div className="ammo">
      <div className="slots">
        {hud.slots.map((s) => (
          <div key={s.slot} className={`slot${s.active ? ' active' : ''}`}>
            <em>{s.key}</em>
            {s.name}
          </div>
        ))}
      </div>
      <div className="weapon-name">{w.name}</div>
      {w.ammoless ? (
        <div className="count">∞</div>
      ) : (
        <div className={`count${low ? ' low' : ''}`}>
          <b>{w.mag}</b>
          <span>/ {w.reserve}</span>
        </div>
      )}
      {w.reloading && (
        <div className="reload">
          <span>换弹中</span>
          <div className="bar">
            <div style={{ width: `${Math.round(w.reloadPct * 100)}%` }} />
          </div>
        </div>
      )}
      {!w.ammoless && !w.reloading && w.mag === 0 && w.reserve === 0 && <div className="reload out">弹药耗尽</div>}
    </div>
  );
}

function Killfeed({ hud }: { hud: HudState }): JSX.Element {
  return (
    <div className="killfeed">
      {hud.killfeed.map((k) => (
        <div key={k.id} className={`kill${k.involvesPlayer ? ' me' : ''}`}>
          <span className={`n ${k.killerTeam.toLowerCase()}`}>{k.killer}</span>
          <span className="w">{k.weapon}</span>
          {k.headshot && <span className="hs" title="爆头">◎</span>}
          <span className={`n ${k.victimTeam.toLowerCase()}`}>{k.victim}</span>
        </div>
      ))}
    </div>
  );
}

function TopBar({ hud }: { hud: HudState }): JSX.Element {
  return (
    <div className="topbar">
      <div className="side ct">
        <span className="lbl">CT</span>
        <b className="alive">{hud.ct}</b>
        <span className="score">{hud.scoreCT}</span>
      </div>
      <div className={`clock${hud.timeLow ? ' low' : ''}${hud.bombPlanted ? ' bomb' : ''}`}>
        {hud.bombPlanted && <span className="c4">C4</span>}
        {hud.timeLabel}
      </div>
      <div className="side t">
        <span className="score">{hud.scoreT}</span>
        <b className="alive">{hud.t}</b>
        <span className="lbl">T</span>
      </div>
      <div className="sub">
        第 {hud.round} 回合 · 先胜 {hud.winScore} 局
        {hud.bombPlanted && hud.bombSite ? ` · C4 已安放于 ${hud.bombSite} 点` : ''}
      </div>
    </div>
  );
}

function MinimapView(): JSX.Element {
  const session = useSession();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const mm = session.minimap;
    canvas.width = Math.round(mm.width * dpr);
    canvas.height = Math.round(mm.height * dpr);
    canvas.style.width = `${mm.width}px`;
    canvas.style.height = `${mm.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.scale(dpr, dpr);
    let lastDraw = 0;
    return session.onFrame(() => {
      // ~30 fps is plenty for a radar
      const now = performance.now();
      if (now - lastDraw < 33) return;
      lastDraw = now;
      mm.draw(ctx, session.game.viewChar, now / 1000);
    });
  }, [session]);
  return (
    <div className="minimap">
      <canvas ref={ref} />
    </div>
  );
}

function Banner({ hud }: { hud: HudState }): JSX.Element | null {
  if (!hud.banner) return null;
  return (
    <div className={`banner ${hud.banner.tone}`} key={hud.banner.text + hud.banner.sub.slice(0, 2)}>
      <div className="big">{hud.banner.text}</div>
      {hud.banner.sub && <div className="small">{hud.banner.sub}</div>}
    </div>
  );
}

function PromptAndProgress({ hud }: { hud: HudState }): JSX.Element {
  return (
    <>
      {hud.prompt && !hud.progress && <div className="prompt">{hud.prompt}</div>}
      {hud.progress && (
        <div className="progress">
          <div className="label">{hud.progress.label}</div>
          <div className="bar">
            <div style={{ width: `${Math.round(hud.progress.pct * 100)}%` }} />
          </div>
        </div>
      )}
    </>
  );
}

function DamageFeedback({ hud }: { hud: HudState }): JSX.Element {
  const dirStyle: CSSProperties = { transform: `rotate(${hud.hurtAngle}rad)` };
  return (
    <>
      {hud.hurtSeq > 0 && (
        <div key={`h${hud.hurtSeq}`} className="hurt">
          <div className="dir" style={dirStyle}>
            <i />
          </div>
        </div>
      )}
      {hud.hitSeq > 0 && (
        <div key={`m${hud.hitSeq}`} className={`hitmarker${hud.hitHeadshot ? ' head' : ''}${hud.hitKill ? ' kill' : ''}`}>
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
    </>
  );
}

function Flash(): JSX.Element {
  const session = useSession();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    return session.onFrame((f) => {
      const el = ref.current;
      if (el) el.style.opacity = String(f.whiteout);
    });
  }, [session]);
  return <div ref={ref} className="flash" />;
}

function BuyMenu({ hud, session }: { hud: HudState; session: GameSession }): JSX.Element | null {
  if (!hud.buyOpen) return null;
  const groups: [string, string][] = [
    ['rifle', '步枪'],
    ['sniper', '狙击枪'],
    ['pistol', '手枪'],
    ['gear', '装备'],
  ];
  return (
    <div className="buy">
      <div className="head">
        <span>购买菜单</span>
        <b>${hud.money}</b>
      </div>
      {groups.map(([cat, label]) => {
        const items = hud.buyItems.filter((i) => i.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat} className="group">
            <h4>{label}</h4>
            {items.map((i) => (
              <button
                key={i.id}
                className={`item${i.enabled ? '' : ' off'}${i.owned ? ' owned' : ''}`}
                onClick={() => session.buy(i.id)}
                disabled={!i.enabled}
              >
                <em>{i.key}</em>
                <span>{i.name}</span>
                <b>{i.owned ? '已拥有' : `$${i.price}`}</b>
              </button>
            ))}
          </div>
        );
      })}
      <div className="hint">按数字键购买 · B 关闭</div>
    </div>
  );
}

function Scoreboard({ hud }: { hud: HudState }): JSX.Element | null {
  if (!hud.showScoreboard) return null;
  const teams: ['CT' | 'T', string][] = [
    ['CT', '反恐精英'],
    ['T', '恐怖分子'],
  ];
  return (
    <div className="scoreboard">
      <div className="score-head">
        <span className="ct">CT {hud.scoreCT}</span>
        <span className="round">第 {hud.round} 回合</span>
        <span className="t">{hud.scoreT} T</span>
      </div>
      {teams.map(([team, name]) => (
        <table key={team} className={team.toLowerCase()}>
          <thead>
            <tr>
              <th className="nm">{name}</th>
              <th>击杀</th>
              <th>死亡</th>
              <th>得分</th>
              <th>金钱</th>
            </tr>
          </thead>
          <tbody>
            {hud.scoreboard
              .filter((r) => r.team === team)
              .map((r) => (
                <tr key={r.id} className={`${r.alive ? '' : 'dead'}${r.isPlayer ? ' me' : ''}`}>
                  <td className="nm">
                    {r.name}
                    {r.hasBomb && team === 'T' && hud.playerTeam === 'T' ? ' 💣' : ''}
                  </td>
                  <td>{r.kills}</td>
                  <td>{r.deaths}</td>
                  <td>{r.score}</td>
                  <td>{r.team === hud.playerTeam ? `$${r.money}` : '-'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

function SpectateBar({ hud, session }: { hud: HudState; session: GameSession }): JSX.Element | null {
  if (hud.alive || hud.phase === 'matchEnd') return null;
  return (
    <div className="spectate">
      <div className="who">{hud.spectating ? `正在观战：${hud.spectating.name}` : '你已阵亡'}</div>
      <div className="keys">
        <button onClick={() => session.cycleSpectate(-1)}>← 上一位</button>
        <button onClick={() => session.cycleSpectate(1)}>下一位 →</button>
        <button className="take" disabled={!hud.canTakeover} onClick={() => session.takeover()}>
          接管此队友（F）
        </button>
      </div>
      <div className="hint">鼠标左键 / ← → 切换视角 · F 接管其操控</div>
    </div>
  );
}

const CONTROLS: [string, string][] = [
  ['W A S D', '移动'],
  ['空格', '跳跃'],
  ['鼠标', '转向 / 左键开火'],
  ['右键', 'AWP 开镜 / 匕首刺击'],
  ['R', '换弹'],
  ['1 2 3 / 滚轮', '主武器 / 手枪 / 匕首'],
  ['Shift', '静步'],
  ['C（按住）', '蹲下'],
  ['E（按住）', '安放 / 拆除 C4'],
  ['B', '购买菜单'],
  ['Tab', '计分板'],
  ['M', '静音'],
];

function PauseOverlay({ hud, session, onExit }: { hud: HudState; session: GameSession; onExit: () => void }): JSX.Element | null {
  if (!hud.paused || hud.matchOver) return null;
  return (
    <div className="pause" onClick={() => session.resume()}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <h2>{hud.started ? '游戏已暂停' : 'DUST2 · 5v5'}</h2>
        <p className="lead">{hud.started ? '按 Esc 释放了鼠标。' : `你是 ${hud.playerTeam === 'CT' ? '反恐精英 (CT)' : '恐怖分子 (T)'}，与 4 名 AI 队友对抗 5 名 AI 敌人。`}</p>
        <button className="primary" onClick={() => session.resume()}>
          {hud.started ? '继续游戏' : '点击开始游戏'}
        </button>
        <div className="controls">
          {CONTROLS.map(([k, v]) => (
            <div key={k}>
              <kbd>{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <button className="ghost" onClick={onExit}>
          返回主菜单
        </button>
      </div>
    </div>
  );
}

function MatchEnd({ hud, onExit, onRestart }: { hud: HudState; onExit: () => void; onRestart: () => void }): JSX.Element | null {
  if (!hud.matchOver) return null;
  return (
    <div className="matchend">
      <div className={`title ${hud.matchOver.winner.toLowerCase()}`}>
        {hud.matchOver.winner === 'CT' ? '反恐精英' : '恐怖分子'}赢得比赛 · {hud.matchOver.text}
      </div>
      <div className="final">
        CT {hud.scoreCT} : {hud.scoreT} T
      </div>
      <div className="actions">
        <button className="primary" onClick={onRestart}>
          再来一局
        </button>
        <button className="ghost" onClick={onExit}>
          返回主菜单
        </button>
      </div>
    </div>
  );
}

export function Hud({ session, onExit, onRestart }: { session: GameSession; onExit: () => void; onRestart: () => void }): JSX.Element {
  return (
    <SessionContext.Provider value={session}>
      <HudInner session={session} onExit={onExit} onRestart={onRestart} />
    </SessionContext.Provider>
  );
}

function HudInner({ session, onExit, onRestart }: { session: GameSession; onExit: () => void; onRestart: () => void }): JSX.Element {
  const hud = useHud();
  return (
    <div className="hud">
      <Scope hud={hud} />
      <Crosshair />
      <DamageFeedback hud={hud} />
      <Flash />
      <MinimapView />
      <TopBar hud={hud} />
      <Killfeed hud={hud} />
      <Banner hud={hud} />
      <PromptAndProgress hud={hud} />
      <Status hud={hud} />
      <AmmoPanel hud={hud} />
      <SpectateBar hud={hud} session={session} />
      <BuyMenu hud={hud} session={session} />
      <Scoreboard hud={hud} />
      <PauseOverlay hud={hud} session={session} onExit={onExit} />
      <MatchEnd hud={hud} onExit={onExit} onRestart={onRestart} />
    </div>
  );
}
