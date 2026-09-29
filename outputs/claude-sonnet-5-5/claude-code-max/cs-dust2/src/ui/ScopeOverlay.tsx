import { useHud } from './EngineContext';

/**
 * 2D sniper scope: while the AWP is zoomed (right mouse button; the 3D camera FOV is narrowed by the renderer) this
 * black mask with a circular lens and a fine reticle covers the screen.
 */
export const ScopeOverlay = () => {
  const level = useHud((h) => h.scopeLevel);
  if (level === 0) return null;
  const fine = level === 2;
  return (
    <div className="scope" aria-hidden="true">
      <div className="scope-mask" />
      <div className="scope-ring" />
      <div className="scope-lines">
        <span className={'scope-h' + (fine ? ' fine' : '')} />
        <span className={'scope-v' + (fine ? ' fine' : '')} />
        <span className="scope-center" />
        {[-3, -2, -1, 1, 2, 3].map((i) => (
          <span key={'mh' + i} className="scope-tick scope-tick-h" style={{ left: `calc(50% + ${i * 3.2}vmin)` }} />
        ))}
        {[-3, -2, -1, 1, 2, 3].map((i) => (
          <span key={'mv' + i} className="scope-tick scope-tick-v" style={{ top: `calc(50% + ${i * 3.2}vmin)` }} />
        ))}
      </div>
      {/* Zoom factors relative to the 75 degree base FOV: tan(37.5)/tan(20) = 2.1x and tan(37.5)/tan(6) = 7.3x. */}
      <div className="scope-zoom">{fine ? '7×' : '2×'}</div>
    </div>
  );
};
