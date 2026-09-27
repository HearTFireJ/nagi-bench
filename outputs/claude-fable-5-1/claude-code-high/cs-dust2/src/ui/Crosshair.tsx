import { useHud } from './GameContext';

const BASE_FOV_DEG = 75;

/** Dynamic crosshair: the gap follows the current weapon inaccuracy. */
export function Crosshair() {
  const hud = useHud();
  const me = hud.me;
  if (me.scoped || !me.alive) return null;
  const h = typeof window !== 'undefined' ? window.innerHeight : 900;
  const px = (Math.tan((me.spreadDeg * Math.PI) / 180) * (h / 2)) / Math.tan((BASE_FOV_DEG * Math.PI) / 360);
  const gap = Math.min(80, 4 + px * 0.9);
  const len = 8;
  const th = 2;
  const showHit = hud.time - hud.hitMarkerTime < 0.18;
  return (
    <div className="crosshair">
      {!me.isMelee && (
        <>
          <div className="line" style={{ left: -th / 2, top: -gap - len, width: th, height: len }} />
          <div className="line" style={{ left: -th / 2, top: gap, width: th, height: len }} />
          <div className="line" style={{ top: -th / 2, left: -gap - len, height: th, width: len }} />
          <div className="line" style={{ top: -th / 2, left: gap, height: th, width: len }} />
        </>
      )}
      <div className="dot" />
      {showHit && (
        <div className="hitmarker">
          <div className="hm" style={{ left: 6, top: 6, transform: 'rotate(45deg)' }} />
          <div className="hm" style={{ left: -16, top: 6, transform: 'rotate(-45deg)' }} />
          <div className="hm" style={{ left: 6, top: -8, transform: 'rotate(-45deg)' }} />
          <div className="hm" style={{ left: -16, top: -8, transform: 'rotate(45deg)' }} />
        </div>
      )}
    </div>
  );
}
