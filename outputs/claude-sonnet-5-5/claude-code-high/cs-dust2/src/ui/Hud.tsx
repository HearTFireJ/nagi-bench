import { runtime } from '../runtime/runtime.ts';
import { hudStore, useStore } from '../runtime/store.ts';
import type { BuyItem } from '../sim/game.ts';
import type { HudState } from '../runtime/store.ts';
import { Minimap } from './Minimap.tsx';

function TopBar({ h }: { h: HudState }) {
  const planted = h.bombState === 'planted';
  return (
    <div className="topbar">
      <div className="side ct">
        <span className="alive">{h.alive.CT}</span>
        <span className="score">{h.score.CT}</span>
      </div>
      <div className="clock">
        <div className={'time' + (planted ? ' planted' : '')}>{planted ? '💣 ' + h.bombClock : h.clock}</div>
        <div className="round">
          {h.phase === 'freeze' ? '冻结时间' : planted ? 'C4 已安放 · ' + h.bombSite + '点' : '第 ' + h.round + ' 回合'}
        </div>
      </div>
      <div className="side t">
        <span className="score">{h.score.T}</span>
        <span className="alive">{h.alive.T}</span>
      </div>
    </div>
  );
}

function Killfeed({ h }: { h: HudState }) {
  return (
    <div className="killfeed">
      {h.killfeed.map((k) => (
        <div key={k.id} className={'kill' + (k.involvesHuman ? ' me' : '')}>
          <span className={'name ' + (k.killerTeam === 'world' ? '' : k.killerTeam.toLowerCase())}>{k.killerName}</span>
          <span className="weapon">
            {k.weapon}
            {k.headshot ? <b className="hs"> ◎</b> : null}
          </span>
          <span className={'name ' + k.victimTeam.toLowerCase()}>{k.victimName}</span>
        </div>
      ))}
    </div>
  );
}

function Crosshair({ h }: { h: HudState }) {
  if (!h.showCrosshair) return null;
  const gap = 3 + h.spreadPx;
  const len = 9;
  return (
    <div className="crosshair">
      <i className="ch l" style={{ transform: `translate(${-gap - len}px,-1px)`, width: len }} />
      <i className="ch r" style={{ transform: `translate(${gap}px,-1px)`, width: len }} />
      <i className="ch u" style={{ transform: `translate(-1px,${-gap - len}px)`, height: len }} />
      <i className="ch d" style={{ transform: `translate(-1px,${gap}px)`, height: len }} />
      <i className="ch dot" />
    </div>
  );
}

function HitMarker({ h }: { h: HudState }) {
  if (h.hitSeq === 0) return null;
  return (
    <div key={h.hitSeq} className={'hitmarker' + (h.hitHead ? ' head' : '')}>
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

function DamageIndicator({ h }: { h: HudState }) {
  if (h.dmgSeq === 0) return null;
  return (
    <div key={h.dmgSeq} className="dmg-flash">
      <div className="dmg-arc" style={{ transform: `rotate(${h.dmgAngle}deg)` }} />
    </div>
  );
}

function Scope({ h }: { h: HudState }) {
  if (h.scopeLevel === 0) return null;
  const d = Math.min(window.innerHeight * 0.94, window.innerWidth * 0.94);
  return (
    <div className="scope">
      <div className="scope-lens" style={{ width: d, height: d }}>
        <div className="scope-h" />
        <div className="scope-v" />
        <div className="scope-dot" />
        <span className="scope-zoom">{h.scopeLevel === 1 ? '×3.5' : '×9'}</span>
      </div>
    </div>
  );
}

function BottomLeft({ h }: { h: HudState }) {
  const low = h.hp <= 25;
  return (
    <div className="bl">
      <div className={'stat hp' + (low ? ' low' : '')}>
        <span className="ico">✚</span>
        <span className="val">{h.hp}</span>
      </div>
      <div className="stat armor">
        <span className="ico">{h.helmet ? '⛑' : '🛡'}</span>
        <span className="val">{h.armor}</span>
      </div>
      <div className="stat money">
        <span className="val">${h.money}</span>
        {h.kit ? <span className="kit">拆弹器</span> : null}
      </div>
      <div className="zone">{h.zone}</div>
    </div>
  );
}

function BottomRight({ h }: { h: HudState }) {
  return (
    <div className="br">
      <div className="slots">
        {h.slots.map((s) => (
          <div key={s.slot} className={'slot' + (s.active ? ' on' : '')}>
            <b>{s.key}</b> {s.name}
          </div>
        ))}
      </div>
      <div className="ammo">
        {h.isMelee ? (
          <span className="knife">{h.weaponName}</span>
        ) : (
          <>
            <span className={'mag' + (h.ammo <= Math.ceil(h.magSize * 0.25) ? ' low' : '')}>{h.ammo}</span>
            <span className="res">/ {h.reserve}</span>
          </>
        )}
      </div>
      {h.reloading ? (
        <div className="reload">
          换弹中
          <div className="bar">
            <i style={{ width: `${h.reloadProgress * 100}%` }} />
          </div>
        </div>
      ) : null}
      {h.hasBomb ? <div className="carry">C4</div> : null}
    </div>
  );
}

function Prompts({ h }: { h: HudState }) {
  let prompt: string | null = null;
  if (h.planting > 0) prompt = '安放 C4 中…';
  else if (h.defusing > 0) prompt = '拆除 C4 中…';
  else if (h.canPlant) prompt = '按住 [E] 安放 C4';
  else if (h.canDefuse) prompt = '按住 [E] 拆除 C4' + (h.kit ? '（拆弹器）' : '');
  else if (h.hasBomb && h.phase === 'live') prompt = '你携带 C4 —— 前往 A / B 点安放';
  const prog = h.planting > 0 ? h.planting : h.defusing;
  if (!prompt) return null;
  return (
    <div className="prompt">
      <div>{prompt}</div>
      {prog > 0 ? (
        <div className="bar big">
          <i style={{ width: `${prog * 100}%` }} className={h.planting > 0 ? 'plant' : 'defuse'} />
        </div>
      ) : null}
    </div>
  );
}

function Banner({ h }: { h: HudState }) {
  if (!h.banner) return null;
  return (
    <div className={'banner ' + h.banner.kind}>
      <div className="t1">{h.banner.text}</div>
      <div className="t2">{h.banner.sub}</div>
    </div>
  );
}

function BuyMenu({ h }: { h: HudState }) {
  if (!h.buyOpen) return null;
  return (
    <div className="buy">
      <div className="buy-head">
        <b>购买菜单</b>
        <span>余额 ${h.money}</span>
        <button className="x" onClick={() => runtime.toggleBuy(false)}>
          B 关闭
        </button>
      </div>
      {h.buyRows.map((r) => (
        <button
          key={r.id}
          className={'buy-row' + (!r.available || r.owned ? ' off' : '') + (!r.affordable && !r.owned ? ' poor' : '')}
          onClick={() => runtime.tryBuy(r.id as BuyItem)}
        >
          <kbd>{r.key}</kbd>
          <span className="n">{r.name}</span>
          <span className="d">{r.owned ? '已拥有' : r.desc}</span>
          <span className="p">${r.price}</span>
        </button>
      ))}
      <div className="buy-note">{h.buyNote}</div>
    </div>
  );
}

function Scoreboard({ h }: { h: HudState }) {
  if (!h.showScoreboard && h.screen !== 'matchEnd') return null;
  const teams: ('CT' | 'T')[] = ['CT', 'T'];
  return (
    <div className="scoreboard">
      <div className="sb-head">
        <span className="ct">CT {h.score.CT}</span>
        <span> : </span>
        <span className="t">{h.score.T} T</span>
      </div>
      {teams.map((t) => (
        <table key={t} className={'sb ' + t.toLowerCase()}>
          <thead>
            <tr>
              <th>{t === 'CT' ? '反恐精英' : '恐怖分子'}</th>
              <th>击杀</th>
              <th>死亡</th>
              <th>金钱</th>
            </tr>
          </thead>
          <tbody>
            {h.scoreboard
              .filter((r) => r.team === t)
              .map((r) => (
                <tr key={r.id} className={(r.alive ? '' : 'dead ') + (r.isYou ? 'you' : '')}>
                  <td>
                    {r.name}
                    {r.hasBomb ? ' 💣' : ''}
                  </td>
                  <td>{r.kills}</td>
                  <td>{r.deaths}</td>
                  <td>${r.money}</td>
                </tr>
              ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

function Spectator({ h }: { h: HudState }) {
  if (!h.dead) return null;
  return (
    <div className="spectate">
      <div className="who">{h.spectating ? '观战：' + h.viewName : '你已阵亡'}</div>
      <div className="hint">
        点击左键 / 右键切换队友
        {h.canTakeover ? ' · 按 [F] 接管该队友' : ''}
      </div>
    </div>
  );
}

function MatchEnd({ h }: { h: HudState }) {
  if (h.screen !== 'matchEnd') return null;
  const won = h.matchWinner === h.playerTeam;
  return (
    <div className="overlay matchend">
      <div className="card-big">
        <h2 className={won ? 'win' : 'lose'}>{won ? '胜利' : '失败'}</h2>
        <p>
          {h.matchWinner === 'CT' ? '反恐精英' : '恐怖分子'}赢得比赛 · {h.score.CT} : {h.score.T}
        </p>
        <div className="btns">
          <button className="start" onClick={() => runtime.restart()}>
            再来一局
          </button>
          <button className="ghost" onClick={() => runtime.toMenu()}>
            返回菜单
          </button>
        </div>
      </div>
    </div>
  );
}

export function Hud() {
  const h = useStore(hudStore);
  const lowHp = h.hp > 0 && h.hp <= 30 && !h.dead;
  return (
    <div className={'hud' + (lowHp ? ' lowhp' : '')}>
      <TopBar h={h} />
      <div className="mm-wrap">
        <Minimap />
        <div className="mm-legend">
          <span className="g">●</span> 队友 <span className="r">●</span> 敌人（被看见） <span className="w">■</span> C4
        </div>
      </div>
      <Killfeed h={h} />
      <Scope h={h} />
      <Crosshair h={h} />
      <HitMarker h={h} />
      <DamageIndicator h={h} />
      <Banner h={h} />
      <Prompts h={h} />
      <BottomLeft h={h} />
      <BottomRight h={h} />
      <Spectator h={h} />
      <BuyMenu h={h} />
      <Scoreboard h={h} />
      <MatchEnd h={h} />
      <div className="fps">{h.fps} fps</div>
      {h.paused ? (
        <div className="overlay pause" onClick={() => runtime.resume()}>
          <div className="card-big">
            <h2>已暂停</h2>
            <p>点击此处回到游戏（重新锁定鼠标）</p>
            <button className="ghost" onClick={(e) => { e.stopPropagation(); runtime.toMenu(); }}>
              返回菜单
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
