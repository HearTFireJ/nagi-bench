import type { Game } from '../core/game/game.ts';
import type { WeaponSlot } from '../core/weapons/defs.ts';

export interface InputCallbacks {
  onLockChange(locked: boolean): void;
  /** first user gesture: unlock audio etc. */
  onGesture(): void;
  onToggleBuy(): void;
  /** number key while the buy menu is open; return true if consumed */
  onBuyKey(n: number): boolean;
  isBuyOpen(): boolean;
  onScoreboard(show: boolean): void;
  onMute(): void;
  /** multiplier for mouse sensitivity (smaller when zoomed in) */
  sensitivityScale(): number;
  canLock(): boolean;
}

const SLOT_ORDER: WeaponSlot[] = ['primary', 'secondary', 'melee'];
const BASE_SENS = 0.0022; // radians per pixel

/**
 * Keyboard / mouse / pointer-lock handling. Writes the human's UserCmd (`game.humanCmd`)
 * every frame and applies mouse look immediately (not on the fixed tick) for low latency.
 */
export class InputController {
  private keys = new Set<string>();
  private fireHeld = false;
  private fire2Held = false;
  private fireLatch = false;
  private fire2Latch = false;
  locked = false;
  sensitivity = 1;
  private game: Game;
  private target: HTMLElement;
  private cbs: InputCallbacks;
  private attached = false;

  constructor(target: HTMLElement, game: Game, cbs: InputCallbacks) {
    this.target = target;
    this.game = game;
    this.cbs = cbs;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    if (document.pointerLockElement === this.target) document.exitPointerLock();
  }

  requestLock(): void {
    if (!this.cbs.canLock()) return;
    try {
      const p = this.target.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } catch {
      // browsers refuse re-locking right after the user pressed Esc; the next click works
    }
  }

  private onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.target;
    if (!this.locked) this.releaseAll();
    this.cbs.onLockChange(this.locked);
  };

  private releaseAll(): void {
    this.keys.clear();
    this.fireHeld = false;
    this.fire2Held = false;
    this.cbs.onScoreboard(false);
  }

  private onBlur = (): void => this.releaseAll();

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.cbs.onGesture();
    if (!this.locked) return;
    const code = e.code;
    if (e.repeat) {
      if (code === 'Tab' || code === 'Space') e.preventDefault();
      return;
    }
    if (code === 'Tab' || code === 'Space' || code.startsWith('Arrow')) e.preventDefault();
    this.keys.add(code);
    const game = this.game;
    const me = game.human;

    if (code === 'KeyB') {
      this.cbs.onToggleBuy();
      return;
    }
    if (code === 'KeyM') {
      this.cbs.onMute();
      return;
    }
    if (code === 'Tab') {
      this.cbs.onScoreboard(true);
      return;
    }
    if (code.startsWith('Digit')) {
      const n = Number(code.slice(5));
      if (this.cbs.isBuyOpen() && this.cbs.onBuyKey(n)) return;
      if (me && me.alive) {
        const slot = SLOT_ORDER[n - 1];
        if (slot) game.humanCmd.slot = slot;
      }
      return;
    }
    if (me && me.alive) {
      if (code === 'KeyR') game.humanCmd.reload = true;
      else if (code === 'KeyQ') game.humanCmd.slot = 'last';
    } else if (me) {
      // spectating
      if (code === 'ArrowRight' || code === 'KeyD') game.cycleSpectate(1);
      else if (code === 'ArrowLeft' || code === 'KeyA') game.cycleSpectate(-1);
      else if (code === 'KeyF' || code === 'KeyE') game.takeover(game.spectateId);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    if (e.code === 'Tab') {
      e.preventDefault();
      this.cbs.onScoreboard(false);
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    const s = BASE_SENS * this.sensitivity * this.cbs.sensitivityScale();
    this.game.look(-e.movementX * s, -e.movementY * s);
  };

  private onMouseDown = (e: MouseEvent): void => {
    this.cbs.onGesture();
    if (!this.locked) return;
    const me = this.game.human;
    if (e.button === 0) {
      if (me && !me.alive) {
        this.game.cycleSpectate(1);
        return;
      }
      this.fireHeld = true;
      this.fireLatch = true;
    } else if (e.button === 2) {
      this.fire2Held = true;
      this.fire2Latch = true;
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.fireHeld = false;
    else if (e.button === 2) this.fire2Held = false;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.locked) return;
    e.preventDefault();
    const me = this.game.human;
    if (!me || !me.alive || Math.abs(e.deltaY) < 1) return;
    const avail = SLOT_ORDER.filter((s) => me.slotWeapon(s));
    const cur = avail.indexOf(me.activeSlot);
    const next = avail[(cur + (e.deltaY > 0 ? 1 : -1) + avail.length) % avail.length];
    this.game.humanCmd.slot = next;
  };

  /** Copy held keys into the game's input command. Call once per frame before `game.advance`. */
  applyTo(game: Game, active: boolean): void {
    const c = game.humanCmd;
    if (!active) {
      c.forward = 0;
      c.strafe = 0;
      c.jump = false;
      c.crouch = false;
      c.walk = false;
      c.use = false;
      c.fire = false;
      c.fire2 = false;
      return;
    }
    const k = this.keys;
    c.forward = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    c.strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    c.jump = k.has('Space');
    // crouch is C only: Ctrl+W would close the browser tab and pages cannot intercept it
    c.crouch = k.has('KeyC');
    c.walk = k.has('ShiftLeft') || k.has('ShiftRight');
    c.use = k.has('KeyE');
    c.fire = this.fireHeld || this.fireLatch;
    c.fire2 = this.fire2Held || this.fire2Latch;
  }

  /** After the sim ran at least one tick the click latches have been seen. */
  afterAdvance(ticks: number): void {
    if (ticks > 0) {
      this.fireLatch = false;
      this.fire2Latch = false;
    }
  }
}
