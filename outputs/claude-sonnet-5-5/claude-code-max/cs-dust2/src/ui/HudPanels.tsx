import { useHud } from './EngineContext';

const fmtTime = (s: number): string => {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
};

/** Scores, alive counts and the round / bomb timer. */
export const TopBar = () => {
  const scoreT = useHud((h) => h.scoreT);
  const scoreCT = useHud((h) => h.scoreCT);
  const aliveT = useHud((h) => h.aliveT);
  const aliveCT = useHud((h) => h.aliveCT);
  const timeLeft = useHud((h) => h.timeLeft);
  const phase = useHud((h) => h.phase);
  const round = useHud((h) => h.round);
  const planted = useHud((h) => h.bombStatus === 'planted');
  const site = useHud((h) => h.bombSite);
  const bombLeft = useHud((h) => h.bombTimeLeft);

  const label = phase === 'freeze' ? '准备阶段' : phase === 'roundEnd' ? '回合结束' : planted ? 'C4 倒计时' : '第 ' + round + ' 回合';
  const shown = planted ? bombLeft : timeLeft;
  return (
    <div className="topbar">
      <div className="team-box ct">
        <span className="team-name">CT</span>
        <b className="score">{scoreCT}</b>
        <span className="alive">{aliveCT}</span>
      </div>
      <div className={'timer' + (planted ? ' bomb' : '') + (planted && bombLeft <= 10 ? ' urgent' : '')}>
        <div className="time">
          {planted ? <i className="c4-ico" /> : null}
          {fmtTime(shown)}
        </div>
        <div className="sub">{planted && site ? label + ' · ' + (site === 'A' ? 'A点' : 'B点') : label}</div>
      </div>
      <div className="team-box t">
        <span className="alive">{aliveT}</span>
        <b className="score">{scoreT}</b>
        <span className="team-name">T</span>
      </div>
    </div>
  );
};

/** Health, armor and money. */
export const HealthPanel = () => {
  const hp = useHud((h) => h.hp);
  const armor = useHud((h) => h.armor);
  const helmet = useHud((h) => h.helmet);
  const money = useHud((h) => h.money);
  const hasBomb = useHud((h) => h.hasBomb);
  const team = useHud((h) => h.viewTeam);
  return (
    <div className="hp-panel">
      {hasBomb && team === 'T' ? <div className="carry-bomb">你携带 C4 · 前往 A点 / B点，按住 E 安放</div> : null}
      <div className="money">$ {money}</div>
      <div className="stats">
        <div className={'stat hp' + (hp <= 25 ? ' low' : '')}>
          <span className="lbl">生命</span>
          <b>{hp}</b>
          <div className="bar">
            <div style={{ width: hp + '%' }} />
          </div>
        </div>
        <div className="stat armor">
          <span className="lbl">{helmet ? '护甲+头盔' : '护甲'}</span>
          <b>{armor}</b>
          <div className="bar">
            <div style={{ width: armor + '%' }} />
          </div>
        </div>
      </div>
    </div>
  );
};

/** Dynamic ammo panel: magazine ticks drop with every shot, refill while reloading; weapon slot list. */
export const AmmoPanel = () => {
  const weapon = useHud((h) => h.weapon);
  const slots = useHud((h) => h.slots);
  const active = useHud((h) => h.activeSlot);
  const keyOf = { primary: '1', secondary: '2', melee: '3', bomb: '5' } as const;
  const low = weapon.magSize > 0 && weapon.ammo <= Math.ceil(weapon.magSize * 0.25);
  return (
    <div className="ammo-panel">
      <div className="slots">
        {slots.map((s) => (
          <div key={s.slot} className={'slot' + (s.slot === active ? ' active' : '')}>
            <kbd>{keyOf[s.slot]}</kbd>
            <span>{s.name}</span>
          </div>
        ))}
      </div>
      <div className="wname">{weapon.name}</div>
      {weapon.melee ? null : (
        <>
          <div className="ammo">
            <b className={low ? 'low' : ''}>{weapon.ammo}</b>
            <span>/ {weapon.reserve}</span>
          </div>
          <div className="mag" style={{ gridTemplateColumns: 'repeat(' + Math.min(weapon.magSize, 30) + ', 1fr)' }}>
            {Array.from({ length: Math.min(weapon.magSize, 30) }, (_, i) => (
              <i key={i} className={i < weapon.ammo ? 'on' : ''} />
            ))}
          </div>
          {weapon.reloading ? (
            <div className="reload">
              <div style={{ width: weapon.reloadProgress * 100 + '%' }} />
              <span>换弹中…</span>
            </div>
          ) : weapon.ammo === 0 && weapon.reserve === 0 ? (
            <div className="reload empty">弹药耗尽</div>
          ) : null}
        </>
      )}
    </div>
  );
};

/** Top-right kill feed. Entries fade out by CSS; the store drops them after a few seconds. */
export const Killfeed = () => {
  const feed = useHud((h) => h.killfeed);
  return (
    <div className="killfeed">
      {feed.map((k) => (
        <div key={k.id} className={'kill' + (k.mine ? ' mine' : '')}>
          <span className={'kn ' + k.killerTeam}>{k.killer}</span>
          <span className="kw">
            {k.weapon}
            {k.headshot ? <i className="hs-ico" title="爆头" /> : null}
          </span>
          <span className={'kn ' + k.victimTeam}>{k.victim}</span>
        </div>
      ))}
    </div>
  );
};

export const BannerView = () => {
  const banner = useHud((h) => h.banner);
  if (!banner) return null;
  return (
    <div className={'banner ' + banner.kind}>
      <h1>{banner.title}</h1>
      <p>{banner.sub}</p>
    </div>
  );
};

/** Contextual prompt ("Hold E to plant ...") and the plant / defuse progress bar. */
export const PromptView = () => {
  const prompt = useHud((h) => h.prompt);
  const progress = useHud((h) => h.useProgress);
  const label = useHud((h) => h.useLabel);
  return (
    <>
      {progress >= 0 ? (
        <div className="progress">
          <div style={{ width: progress * 100 + '%' }} />
          <span>{label}</span>
        </div>
      ) : prompt ? (
        <div className="prompt">{prompt}</div>
      ) : null}
    </>
  );
};

/** Shown after the player died: watch a teammate or take over their bot. */
export const SpectatorBar = () => {
  const spectating = useHud((h) => h.spectating);
  const alive = useHud((h) => h.playerAlive);
  const name = useHud((h) => h.viewName);
  const canTake = useHud((h) => h.canTakeOver);
  if (alive) return null;
  return (
    <div className="spectate">
      {spectating ? (
        <>
          <span>观战队友：</span>
          <b>{name}</b>
          <span className="keys">
            <kbd>←</kbd>
            <kbd>→</kbd> / 鼠标左右键 切换
            {canTake ? (
              <>
                {' · '}
                <kbd>F</kbd> 接管该 bot 的控制
              </>
            ) : null}
          </span>
        </>
      ) : (
        <span>你已阵亡 · 等待下一回合</span>
      )}
    </div>
  );
};
