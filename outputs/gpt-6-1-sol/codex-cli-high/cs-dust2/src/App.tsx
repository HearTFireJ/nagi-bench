import { useEffect, useRef, useState } from "react";
import { GameEngine } from "./game/engine";
import { ROOMS, SOLIDS } from "./game/map";
import { WEAPONS } from "./game/weapons";
import type { Options, Snapshot, WeaponId } from "./game/types";

function Mark({ small = false }: { small?: boolean }) {
  return (
    <svg
      width={small ? 24 : 34}
      height={small ? 26 : 37}
      viewBox="0 0 34 37"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M17 1 32 9.5v18L17 36 2 27.5v-18L17 1Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M10 11h8l7 7-7 8h-8V11Zm5 5v5h3l2-3-2-2h-3Z"
        fill="currentColor"
      />
      <path d="m3 27 7-4M24 13l7-4" stroke="currentColor" />
    </svg>
  );
}
function WeaponIcon({
  id = "ak",
  className = "",
}: {
  id?: WeaponId;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 130 42"
      fill="currentColor"
      aria-hidden="true"
    >
      {id === "knife" ? (
        <path d="m12 28 31-4 58-14 20-1-14 15-60 8-1-5-31 7Z" />
      ) : WEAPONS[id].slot === 1 ? (
        <path d="M38 8h55v6h8v7H67l-3 16H49l3-16H38V8Zm8 2v2h40v-2H46Z" />
      ) : (
        <>
          <path d="m5 22 23-8 5 7h43v-5h22v3h26v5H91v5H72l-1 11H59l4-14H49l-4 10h-9l2-13-9 1-19 5-5-7Z" />
          {id === "awp" ? (
            <path d="M54 7h35v6H54V7Zm7 6h3v6h-3Zm20 0h3v6h-3Z" />
          ) : (
            <path d="M38 15h34v3H38Zm56-4h3v9h-3Z" />
          )}
        </>
      )}
    </svg>
  );
}
function Minimap({
  state,
  large = false,
  preview = false,
}: {
  state: Snapshot | null;
  large?: boolean;
  preview?: boolean;
}) {
  return (
    <div
      className={`minimap ${large ? "large" : ""} ${preview ? "map-preview" : ""}`}
    >
      <div className="map-head">
        <span>
          {large || preview
            ? "DUST II · 战术地图"
            : (state?.location ?? "DUST II")}
        </span>
        <span className="map-north">N ↑</span>
      </div>
      <svg
        viewBox="-38 -32 76 72"
        role="img"
        aria-label="Dust2 战术地图，实时显示队友、被看见的敌人和 C4"
      >
        <defs>
          <pattern
            id={large ? "grid-large" : "grid-small"}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M5 0H0V5"
              fill="none"
              stroke="#7c9490"
              strokeWidth=".12"
              opacity=".18"
            />
          </pattern>
        </defs>
        <rect
          x="-38"
          y="-32"
          width="76"
          height="72"
          fill={`url(#${large ? "grid-large" : "grid-small"})`}
        />
        {ROOMS.map((r, i) => (
          <rect
            key={i}
            x={r.x - r.w / 2}
            y={r.z - r.d / 2}
            width={r.w}
            height={r.d}
            fill="#43504b"
          />
        ))}
        {SOLIDS.map((s, i) => (
          <rect
            key={i}
            x={s.x - s.w / 2}
            y={s.z - s.d / 2}
            width={s.w}
            height={s.d}
            fill={
              s.kind === "wall"
                ? "#7d8270"
                : s.kind === "door"
                  ? "#ad9270"
                  : "#222d29"
            }
          />
        ))}
        <circle
          cx="24"
          cy="-17"
          r="6.5"
          fill="#da985d"
          fillOpacity=".13"
          stroke="#da985d"
          strokeWidth=".25"
        />
        <circle
          cx="-24"
          cy="-15"
          r="7"
          fill="#da985d"
          fillOpacity=".13"
          stroke="#da985d"
          strokeWidth=".25"
        />
        <g
          fill="#ebbd86"
          fontSize="4.5"
          fontFamily="Arial"
          fontWeight="bold"
          textAnchor="middle"
        >
          <text x="24" y="-15.5">
            A
          </text>
          <text x="-24" y="-13.5">
            B
          </text>
        </g>
        {(large || preview) && (
          <g fill="#a2b1a9" fontSize="2.25" textAnchor="middle">
            <text x="0" y="33">
              T SPAWN
            </text>
            <text x="0" y="-22">
              CT SPAWN
            </text>
            <text x="29" y="5">
              LONG
            </text>
            <text x="10" y="-1">
              CAT
            </text>
            <text x="-23" y="19">
              TUNNEL
            </text>
            <text x="0" y="-6">
              MID
            </text>
          </g>
        )}
        {state?.dots.map((d) => (
          <g
            key={d.id}
            transform={`translate(${d.x} ${d.z})`}
            opacity={d.alive ? 1 : 0.3}
          >
            {d.self ? (
              <>
                <circle r="2.2" fill="#e9f3df" fillOpacity=".13" />
                <path
                  d="M0 -2.6 1.5 1.7 0 1 -1.5 1.7Z"
                  fill="#edfae2"
                  transform={`rotate(${(-d.yaw * 180) / Math.PI})`}
                />
              </>
            ) : d.alive ? (
              <circle
                r="1.2"
                fill={d.team === state.team ? "#83c6c8" : "#ed7862"}
                stroke="#182321"
                strokeWidth=".3"
              />
            ) : (
              <path d="m-1-1 2 2m0-2-2 2" stroke="#acc4be" strokeWidth=".45" />
            )}
          </g>
        ))}
        {state &&
          ["carried", "dropped", "planted"].includes(state.bomb.state) && (
            <g transform={`translate(${state.bomb.x} ${state.bomb.z})`}>
              <rect
                x="-1"
                y="-1"
                width="2"
                height="2"
                fill="#f0c075"
                stroke="#151c19"
                strokeWidth=".25"
              />
              {state.bomb.state === "planted" && (
                <circle
                  r="3"
                  fill="none"
                  stroke="#ed7862"
                  strokeWidth=".35"
                  className="bomb-pulse"
                />
              )}
            </g>
          )}
      </svg>
      {(large || preview) && (
        <div className="map-key">
          <span>
            <i className="friendly-dot" />
            友方
          </span>
          <span>
            <i className="enemy-dot" />
            可见敌人
          </span>
          <span>
            <i className="bomb-dot" />
            C4
          </span>
        </div>
      )}
    </div>
  );
}
function App() {
  const host = useRef<HTMLDivElement>(null),
    game = useRef<GameEngine | null>(null);
  const [state, setState] = useState<Snapshot | null>(null),
    [error, setError] = useState("");
  const [options, setOptions] = useState<Options>({
    team: "CT",
    pistol: false,
    primary: "m4",
    secondary: "default",
    sensitivity: 1,
    volume: 0.65,
  });
  const [help, setHelp] = useState(false),
    [mapOpen, setMapOpen] = useState(false),
    [scoreboard, setScoreboard] = useState(false),
    [settings, setSettings] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    try {
      game.current = new GameEngine(host.current, setState);
      if (import.meta.env.DEV) window.__DUST2__ = game.current;
    } catch (e) {
      setError(e instanceof Error ? e.message : "浏览器无法创建 WebGL 场景");
    }
    const down = (e: KeyboardEvent) => {
      if (!game.current?.locked) return;
      if (e.code === "Tab") {
        e.preventDefault();
        setScoreboard(true);
      }
      if (e.code === "KeyM" && !e.repeat) setMapOpen((v) => !v);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Tab") setScoreboard(false);
    };
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    return () => {
      if (window.__DUST2__ === game.current) delete window.__DUST2__;
      game.current?.dispose();
      game.current = null;
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
    };
  }, []);
  const menu = !state || state.phase === "menu";
  const start = () => {
    setHelp(false);
    setSettings(false);
    setMapOpen(false);
    game.current?.begin(options);
  };
  const clock = (time: number) =>
    `${Math.floor(time / 60)}:${Math.floor(time % 60)
      .toString()
      .padStart(2, "0")}`;
  return (
    <div className={`app ${menu ? "is-menu" : "is-playing"}`}>
      <div className="world-canvas" ref={host} />
      {menu ? (
        <div className="menu-screen">
          <div className="menu-shade" />
          <div className="screen-grain" />
          <header className="topbar">
            <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
              <Mark />
              <span>
                PROTOCOL<span className="brand-sub">TACTICAL OPERATIONS</span>
              </span>
            </a>
            <div className="top-links">
              <span className="nav-active">作战大厅</span>
              <button
                onClick={() => {
                  setMapOpen((v) => !v);
                  setHelp(false);
                }}
              >
                战术地图 <span>↗</span>
              </button>
              <button
                onClick={() => {
                  setHelp((v) => !v);
                  setMapOpen(false);
                }}
              >
                操作指南 <span>↗</span>
              </button>
            </div>
            <div className="system-status">
              <i />
              系统就绪<span>LOCAL / 5V5</span>
            </div>
          </header>
          <main className="lobby-main">
            <section className="hero">
              <div className="eyebrow">
                <span className="small-line" />
                经典战场 · 竞技拆弹
              </div>
              <h1>
                DUST
                <span>
                  II<span className="title-square">02</span>
                </span>
              </h1>
              <p className="hero-description">
                一片沙尘，两个包点。
                <br />
                每一次转角，都是战术的开始。
              </p>
              <div className="hero-tags">
                <span>
                  5 <small>VS</small> 5
                </span>
                <span>第一人称</span>
                <span>竞技拆弹</span>
              </div>
              <div className="operation-id">
                <span>OPERATION / 002</span>
                <span>沙漠行动 · DUST II</span>
              </div>
            </section>
            <div className="site-callout">
              <span className="callout-cross">+</span>
              <div>
                <small>现场侦察 / LIVE VIEW</small>
                <b>A 包点</b>
                <span>32° 34′ N &nbsp; 13° 11′ E</span>
              </div>
            </div>
            <section className="loadout-panel">
              <div className="panel-title">
                <span>
                  <span className="orange-square" />
                  部署作战
                </span>
                <span className="panel-code">01 / READY</span>
              </div>
              <div className="field-label">
                选择阵营 <span>SELECT YOUR SIDE</span>
              </div>
              <div className="team-select">
                {(["CT", "T"] as const).map((t) => (
                  <button
                    key={t}
                    className={`team-button ${options.team === t ? "selected" : ""} ${t.toLowerCase()}`}
                    onClick={() =>
                      setOptions((o) => ({
                        ...o,
                        team: t,
                        primary: t === "CT" ? "m4" : "ak",
                      }))
                    }
                  >
                    <span className="team-symbol">
                      {t === "CT" ? "⛨" : "⌖"}
                    </span>
                    <span>
                      <b>{t === "CT" ? "反恐精英" : "恐怖分子"}</b>
                      <small>
                        {t === "CT" ? "守卫 · DEFEND" : "进攻 · ATTACK"}
                      </small>
                    </span>
                    <i />
                  </button>
                ))}
              </div>
              <div className="field-label">
                回合配置 <span>ROUND TYPE</span>
              </div>
              <div className="mode-select">
                <button
                  className={!options.pistol ? "selected" : ""}
                  onClick={() => setOptions((o) => ({ ...o, pistol: false }))}
                >
                  全装对抗<small>FULL BUY</small>
                </button>
                <button
                  className={options.pistol ? "selected" : ""}
                  onClick={() => setOptions((o) => ({ ...o, pistol: true }))}
                >
                  手枪开局<small>PISTOL ROUND</small>
                </button>
              </div>
              <div className="field-label">
                {options.pistol ? "第一回合装备" : "主武器"}
                <span>
                  {options.pistol ? "NO ARMOR / NO PRIMARY" : "PRIMARY WEAPON"}
                </span>
              </div>
              {options.pistol ? (
                <div className="pistol-loadout">
                  <WeaponIcon id={options.team === "CT" ? "usp" : "glock"} />
                  <div>
                    <b>{options.team === "CT" ? "USP-S" : "Glock-18"}</b>
                    <small>默认手枪 + 匕首 · 无护甲</small>
                  </div>
                </div>
              ) : (
                <div className="weapon-select">
                  {(["ak", "m4", "awp"] as const).map((id) => (
                    <button
                      key={id}
                      className={options.primary === id ? "selected" : ""}
                      onClick={() => setOptions((o) => ({ ...o, primary: id }))}
                    >
                      <WeaponIcon id={id} />
                      <b>{WEAPONS[id].name}</b>
                      <small>
                        {id === "ak"
                          ? "高伤害"
                          : id === "m4"
                            ? "稳定连射"
                            : "一击致命"}
                      </small>
                    </button>
                  ))}
                </div>
              )}
              {!options.pistol && (
                <button
                  className="secondary-toggle"
                  onClick={() =>
                    setOptions((o) => ({
                      ...o,
                      secondary:
                        o.secondary === "default" ? "deagle" : "default",
                    }))
                  }
                >
                  <span>副武器</span>
                  <b>
                    {options.secondary === "deagle"
                      ? "Desert Eagle"
                      : options.team === "CT"
                        ? "USP-S"
                        : "Glock-18"}
                  </b>
                  <span>⇄</span>
                </button>
              )}
              <button
                className="deploy-button"
                onClick={start}
                disabled={!state || !!error}
              >
                <span>
                  进入战场<small>DEPLOY TO DUST II</small>
                </span>
                <span className="button-arrow">↗</span>
              </button>
              <div className="deploy-note">
                <i />1 名玩家 + 9 名自主 AI · 无需联网
              </div>
            </section>
          </main>
          <footer className="lobby-footer">
            <div>
              <span className="footer-label">战场简报</span>
              <b>控制关键区域，赢下回合。</b>
            </div>
            <div className="brief-item">
              <span>01</span>
              <div>
                推进与交火<small>A 大 / 中门 / B 洞</small>
              </div>
            </div>
            <div className="brief-item">
              <span>02</span>
              <div>
                安放或拆除 C4<small>长按 E 与目标交互</small>
              </div>
            </div>
            <div className="brief-item">
              <span>03</span>
              <div>
                团队永不离线<small>阵亡后按 F 接管队友</small>
              </div>
            </div>
            <button
              className="settings-button"
              onClick={() => setSettings((v) => !v)}
              aria-label="声音与灵敏度设置"
            >
              ⚙
            </button>
          </footer>
          <div className="build-info">
            <span>ALL SYSTEMS READY / DESERT OPERATIONS</span>
            <span>DUST II · LOCAL OPERATIONS &nbsp; · &nbsp; BUILD 1.0</span>
          </div>
        </div>
      ) : (
        state && (
          <>
            <div className="hud-edge" />
            <div className="top-match">
              <div className="team-count ct">
                <span>CT</span>
                <div>
                  {Array.from({ length: 5 }, (_, i) => (
                    <i key={i} className={i < state.ctAlive ? "living" : ""} />
                  ))}
                </div>
                <b>{state.score.CT}</b>
              </div>
              <div
                className={`round-clock ${state.bomb.state === "planted" ? "planted" : ""}`}
              >
                <small>
                  {state.bomb.state === "planted"
                    ? `C4 · ${state.bomb.site} 点`
                    : `ROUND ${String(state.round).padStart(2, "0")}`}
                </small>
                <b>
                  {state.bomb.state === "planted"
                    ? clock(state.bomb.remaining)
                    : clock(state.time)}
                </b>
              </div>
              <div className="team-count t">
                <b>{state.score.T}</b>
                <div>
                  {Array.from({ length: 5 }, (_, i) => (
                    <i key={i} className={i < state.tAlive ? "living" : ""} />
                  ))}
                </div>
                <span>T</span>
              </div>
            </div>
            <div className="map-wrap">
              <Minimap state={state} />
              <div className="map-caption">
                <span>
                  <i />
                  LIVE INTEL
                </span>
                <span>M 战术地图</span>
              </div>
            </div>
            <div className="killfeed">
              {state.feed.map((k) => (
                <div key={k.id}>
                  <b className={k.team.toLowerCase()}>{k.killer}</b>
                  <span>{k.weapon}</span>
                  {k.headshot && <strong title="爆头">⌖</strong>}
                  <b>{k.victim}</b>
                </div>
              ))}
            </div>
            {state.scoped ? (
              <div className="scope">
                <div className="scope-circle">
                  <span className="scope-vertical" />
                  <span className="scope-horizontal" />
                  <i />
                  <small>4× &nbsp; · &nbsp; AWP</small>
                </div>
              </div>
            ) : (
              state.alive &&
              state.phase === "playing" && (
                <div
                  className={`crosshair ${state.hit ? "hit" : ""}`}
                  style={
                    {
                      "--gap": `${5 + state.spread * 380}px`,
                    } as React.CSSProperties
                  }
                >
                  <i />
                  <i />
                  <i />
                  <i />
                  <b />
                  {state.hit && <span>×</span>}
                </div>
              )
            )}
            {state.damage && <div className="damage-vignette" />}
            {state.message && state.phase === "playing" && (
              <div
                className={`action-message ${!state.alive ? "death-message" : ""}`}
              >
                {!state.alive && <span>阵亡</span>}
                {state.message}
              </div>
            )}
            {state.action > 0 && (
              <div className="action-progress">
                <span>
                  {state.actionKind === "plant" ? "正在安放 C4" : "正在拆除 C4"}
                  <b>{Math.round(state.action * 100)}%</b>
                </span>
                <div>
                  <i style={{ width: `${state.action * 100}%` }} />
                </div>
              </div>
            )}
            <div className="bottom-hud">
              <div className="health-panel">
                <div
                  className={`health-value ${state.health < 30 ? "critical" : ""}`}
                >
                  <span>＋</span>
                  <b>{state.health}</b>
                  <small>生命值</small>
                </div>
                <div className="health-bar">
                  <i style={{ width: `${state.health}%` }} />
                </div>
                <div className="armor-value">
                  <span>⛨</span>
                  <b>{state.armor}</b>
                  <small>护甲</small>
                </div>
              </div>
              <div className="bottom-center">
                <span>
                  {state.team === "CT" ? "反恐精英" : "恐怖分子"} <i />{" "}
                  {state.name}
                </span>
                <small>WASD 移动 · R 换弹 · E 交互 · TAB 战绩 · ESC 暂停</small>
                {state.bomb.carrier === game.current?.playerId && (
                  <b className="carrying">▣ C4 已携带</b>
                )}
              </div>
              <div className="ammo-panel">
                <div className="gun-name">
                  <span>{WEAPONS[state.weapon].name}</span>
                  <small>{state.reloading ? "RELOADING" : "READY"}</small>
                </div>
                <div className="ammo-main">
                  <WeaponIcon id={state.weapon} />
                  {state.weapon === "knife" ? (
                    <b className="knife-ammo">∞</b>
                  ) : (
                    <>
                      <b className={state.ammo < 5 ? "low-ammo" : ""}>
                        {String(state.ammo).padStart(2, "0")}
                      </b>
                      <span>/ {state.reserve}</span>
                    </>
                  )}
                </div>
                {state.reloading > 0 && (
                  <div className="reload-bar">
                    <i style={{ width: `${(1 - state.reloading) * 100}%` }} />
                  </div>
                )}
                <div className="slot-hints">
                  <span
                    className={WEAPONS[state.weapon].slot === 0 ? "active" : ""}
                  >
                    1 主武器
                  </span>
                  <span
                    className={WEAPONS[state.weapon].slot === 1 ? "active" : ""}
                  >
                    2 手枪
                  </span>
                  <span className={state.weapon === "knife" ? "active" : ""}>
                    3 近战
                  </span>
                </div>
              </div>
            </div>
            {state.phase === "over" && (
              <div className="round-result">
                <Mark />
                <small>ROUND COMPLETE</small>
                <h2>
                  {state.winner === "CT" ? "反恐精英胜利" : "恐怖分子胜利"}
                </h2>
                <p>{state.reason}</p>
                <span>下一回合即将开始</span>
              </div>
            )}
            {!state.locked && (
              <div className="pause-overlay">
                <div className="pause-card">
                  <Mark />
                  <small>OPERATIONS ON HOLD</small>
                  <h2>战场已暂停</h2>
                  <p>继续行动，捕获鼠标视角。</p>
                  <button
                    className="deploy-button"
                    onClick={() => game.current?.lock()}
                  >
                    <span>继续行动</span>
                    <span>↗</span>
                  </button>
                  <button
                    className="quiet-button"
                    onClick={() => {
                      game.current?.returnToMenu();
                      setScoreboard(false);
                      setMapOpen(false);
                    }}
                  >
                    返回作战大厅
                  </button>
                  <div className="pause-controls">
                    WASD 移动 · 鼠标瞄准 · 左键射击
                    <br />1 / 2 / 3 切换武器 · 右键 AWP 开镜
                    <br />
                    空格跳跃 · E 安放 / 拆包 · F 接管队友
                  </div>
                </div>
              </div>
            )}
            {scoreboard && (
              <div className="scoreboard-overlay">
                <div className="scoreboard">
                  <div className="panel-title">
                    <span>DUST II · 本回合战绩</span>
                    <span>5V5</span>
                  </div>
                  {(["CT", "T"] as const).map((t) => (
                    <section key={t}>
                      <h3 className={t.toLowerCase()}>
                        {t === "CT" ? "反恐精英" : "恐怖分子"}{" "}
                        <span>{state.score[t]}</span>
                      </h3>
                      <div className="score-row heading">
                        <span>呼号</span>
                        <span>状态</span>
                        <span>击杀</span>
                        <span>阵亡</span>
                      </div>
                      {state.players
                        .filter((p) => p.team === t)
                        .map((p) => (
                          <div
                            key={p.id}
                            className={`score-row ${p.id === game.current?.playerId ? "self" : ""}`}
                          >
                            <b>{p.name}</b>
                            <span>{p.alive ? "存活" : "阵亡"}</span>
                            <span>{p.kills}</span>
                            <span>{p.deaths}</span>
                          </div>
                        ))}
                    </section>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      )}
      {mapOpen && (
        <div
          className={`modal-overlay ${!menu ? "in-game-modal" : ""}`}
          onClick={() => menu && setMapOpen(false)}
        >
          <div className="map-modal" onClick={(e) => e.stopPropagation()}>
            <Minimap state={menu ? null : state} large />
            <p>T 出生 → A 大 / 中路 / B 洞 → A / B 包点 → CT 出生</p>
            {menu ? (
              <button
                className="quiet-button"
                onClick={() => setMapOpen(false)}
              >
                关闭地图 ×
              </button>
            ) : (
              <small>按 M 关闭地图</small>
            )}
          </div>
        </div>
      )}
      {help && (
        <div className="modal-overlay" onClick={() => setHelp(false)}>
          <div className="help-card" onClick={(e) => e.stopPropagation()}>
            <div className="panel-title">
              <span>战术操作指南</span>
              <button onClick={() => setHelp(false)}>×</button>
            </div>
            <h2>先熟悉操作，再控制战场。</h2>
            <div className="control-list">
              {[
                ["W A S D", "移动"],
                ["鼠标", "转动视角"],
                ["左键 / 右键", "开火 / AWP 开镜"],
                ["SPACE / SHIFT", "跳跃 / 静步"],
                ["1 / 2 / 3 · Q", "选择武器 / 上一把武器"],
                ["R", "换弹"],
                ["长按 E", "包点安放 3.2s / 拆包 5s"],
                ["F", "阵亡后接管存活队友"],
                ["M / TAB / ESC", "地图 / 战绩 / 暂停"],
              ].map(([key, label]) => (
                <div key={key}>
                  <kbd>{key}</kbd>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <p>
              CT：守住包点，或在 40 秒内拆除 C4。
              <br />
              T：消灭守军，或让 C4 成功引爆。
              <br />
              首回合选择手枪局时，全员仅持默认手枪与刀，无护甲；后续回合自动全装。
            </p>
          </div>
        </div>
      )}
      {settings && (
        <div className="modal-overlay" onClick={() => setSettings(false)}>
          <div className="settings-card" onClick={(e) => e.stopPropagation()}>
            <div className="panel-title">
              <span>行动设置</span>
              <button onClick={() => setSettings(false)}>×</button>
            </div>
            <label>
              鼠标灵敏度 <b>{options.sensitivity.toFixed(1)}</b>
              <input
                aria-label="鼠标灵敏度"
                type="range"
                min=".3"
                max="2"
                step=".1"
                value={options.sensitivity}
                onChange={(e) =>
                  setOptions((o) => ({
                    ...o,
                    sensitivity: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label>
              音效音量 <b>{Math.round(options.volume * 100)}%</b>
              <input
                aria-label="音效音量"
                type="range"
                min="0"
                max="1"
                step=".05"
                value={options.volume}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, volume: Number(e.target.value) }))
                }
              />
            </label>
            <p>调节战场音效，听清脚步与 C4 提示。</p>
          </div>
        </div>
      )}
      {error && (
        <div className="error-card">
          <h2>无法启动 3D 渲染</h2>
          <p>{error}</p>
          <p>请使用启用硬件加速的 Chrome、Edge 或 Firefox。</p>
        </div>
      )}
    </div>
  );
}
export default App;
