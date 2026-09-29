import { Crosshair } from './Crosshair';
import { AmmoPanel, BannerView, HealthPanel, Killfeed, PromptView, SpectatorBar, TopBar } from './HudPanels';
import { Minimap } from './Minimap';
import { BuyMenu, DamageIndicator, HitMarker, MatchEndOverlay, PauseOverlay, Scoreboard } from './Overlays';
import { ScopeOverlay } from './ScopeOverlay';
import { useHud } from './EngineContext';

/** In-game 2D overlay: crosshair, health / armor, ammo, kill feed, minimap, timers, scope, menus. */
export const Hud = () => {
  const screen = useHud((h) => h.screen);
  const fallback = useHud((h) => h.fallbackLook);
  if (screen === 'menu') return null;
  return (
    <div className="hud">
      <ScopeOverlay />
      <Crosshair />
      <HitMarker />
      <DamageIndicator />
      <TopBar />
      <Minimap />
      <Killfeed />
      <BannerView />
      <PromptView />
      <SpectatorBar />
      <HealthPanel />
      <AmmoPanel />
      <BuyMenu />
      <Scoreboard />
      <PauseOverlay />
      <MatchEndOverlay />
      {fallback ? <div className="fallback-note">未能锁定鼠标：已切换为普通鼠标视角模式</div> : null}
    </div>
  );
};
