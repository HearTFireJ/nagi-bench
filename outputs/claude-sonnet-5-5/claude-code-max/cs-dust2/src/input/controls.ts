// Keyboard + mouse input with pointer lock. It owns no game logic: every frame `applyTo` copies the state into the
// controlled actor's ActorInput (held keys as levels, presses as edge flags the simulation consumes) and applies the
// accumulated mouse movement to the view angles.
import { clamp } from '../core/math';
import type { Actor, WeaponSlot } from '../game/types';

export interface InputHandlers {
  onLockChange: (locked: boolean) => void;
  onLockError: () => void;
  onBuyToggle: () => void;
  onBuyKey: (digit: number) => void;
  onScoreboard: (down: boolean) => void;
  onTakeOver: () => void;
  onSpectateNext: (dir: 1 | -1) => void;
  onAnyGesture: () => void;
}

const BASE_SENS = 0.0022; // radians per mouse pixel at sensitivity 1
const PITCH_LIMIT = (89 * Math.PI) / 180;

export class InputController {
  private readonly target: HTMLElement;
  private readonly handlers: InputHandlers;
  private readonly keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private fireHeld = false;
  private pendingReload = false;
  private pendingScope = false;
  private pendingSlot: WeaponSlot | null = null;
  private pendingLast = false;
  private pendingDrop = false;
  private wheel = 0;
  private spectateClick = 0;
  private disposed = false;
  private lockErrors = 0;

  locked = false;
  /** When pointer lock is refused (iframes, some browsers) we fall back to plain mouse-move look. */
  fallback = false;
  sensitivity = 1;
  buyOpen = false;
  /** Whether input is routed to the game at all (false on menus). */
  enabled = false;

  constructor(target: HTMLElement, handlers: InputHandlers) {
    this.target = target;
    this.handlers = handlers;
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('contextmenu', this.onContext);
  }

  dispose(): void {
    this.disposed = true;
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('contextmenu', this.onContext);
    if (document.pointerLockElement === this.target) document.exitPointerLock();
  }

  requestLock(): void {
    if (this.disposed) return;
    this.handlers.onAnyGesture();
    if (typeof this.target.requestPointerLock !== 'function') {
      this.fallback = true;
      this.locked = true;
      this.handlers.onLockChange(true);
      return;
    }
    try {
      const r = this.target.requestPointerLock() as unknown;
      // Newer browsers return a promise that rejects when the request is refused.
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => this.onLockError());
    } catch {
      this.onLockError();
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement === this.target) document.exitPointerLock();
    if (this.fallback) {
      this.locked = false;
      this.handlers.onLockChange(false);
    }
  }

  private readonly onLockChange = (): void => {
    const locked = document.pointerLockElement === this.target;
    if (locked === this.locked) return;
    this.locked = locked;
    if (locked) this.lockErrors = 0;
    if (!locked) {
      this.fireHeld = false;
      this.keys.clear();
    }
    this.handlers.onLockChange(locked);
  };

  private readonly onLockError = (): void => {
    // A single refusal is usually transient (browsers reject a request made right after the user pressed ESC): stay
    // paused so the next click can retry. Repeated refusals mean pointer lock is unavailable (iframes, some browsers):
    // fall back to plain mouse-move look so the game stays playable.
    this.lockErrors++;
    this.handlers.onLockError();
    if (this.lockErrors < 2) return;
    this.fallback = true;
    this.locked = true;
    this.handlers.onLockChange(true);
  };

  private readonly onBlur = (): void => {
    this.keys.clear();
    this.fireHeld = false;
  };

  private readonly onContext = (e: Event): void => {
    if (this.enabled) e.preventDefault();
  };

  private active(): boolean {
    return this.enabled && this.locked;
  }

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.active()) return;
    this.lookX += e.movementX || 0;
    this.lookY += e.movementY || 0;
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.active()) return;
    if (e.button === 0) {
      this.fireHeld = true;
      this.spectateClick = 1;
    } else if (e.button === 2) {
      this.pendingScope = true;
      this.spectateClick = -1;
    }
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.fireHeld = false;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.active()) return;
    e.preventDefault();
    this.wheel += Math.sign(e.deltaY);
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled) return;
    const code = e.code;
    if (code === 'Tab') {
      e.preventDefault();
      if (!e.repeat) this.handlers.onScoreboard(true);
      return;
    }
    if (!this.locked) return;
    // Without real pointer lock the browser never reports ESC as "lock lost", so pause explicitly.
    if (code === 'Escape' && this.fallback) {
      this.releaseLock();
      return;
    }
    if (e.repeat) {
      if (code === 'Space' || code.startsWith('Arrow')) e.preventDefault();
      return;
    }
    this.keys.add(code);
    switch (code) {
      case 'Space':
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault();
        break;
      case 'KeyR':
        this.pendingReload = true;
        break;
      case 'KeyB':
        this.handlers.onBuyToggle();
        break;
      case 'KeyQ':
        this.pendingLast = true;
        break;
      case 'KeyG':
        this.pendingDrop = true;
        break;
      case 'KeyF':
        this.handlers.onTakeOver();
        break;
      case 'ArrowLeft':
      case 'BracketLeft':
        this.handlers.onSpectateNext(-1);
        break;
      case 'ArrowRight':
      case 'BracketRight':
        this.handlers.onSpectateNext(1);
        break;
      default:
        break;
    }
    const digit = /^(Digit|Numpad)(\d)$/.exec(code);
    if (digit) {
      const n = Number(digit[2]);
      if (this.buyOpen) this.handlers.onBuyKey(n);
      else if (n === 1) this.pendingSlot = 'primary';
      else if (n === 2) this.pendingSlot = 'secondary';
      else if (n === 3) this.pendingSlot = 'melee';
      else if (n === 4 || n === 5) this.pendingSlot = 'bomb';
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    if (e.code === 'Tab') {
      e.preventDefault();
      this.handlers.onScoreboard(false);
    }
  };

  /** Consume clicks meant for spectating (left = next, right = previous). */
  takeSpectateClick(): 0 | 1 | -1 {
    const c = this.spectateClick;
    this.spectateClick = 0;
    return c === 1 ? 1 : c === -1 ? -1 : 0;
  }

  /**
   * Copy the current input into `actor` and apply mouse look. `fovScale` shrinks the sensitivity while zoomed.
   * `slots` lists the slots the actor owns (for the mouse wheel).
   */
  applyTo(actor: Actor, fovScale: number, slots: WeaponSlot[]): void {
    const inp = actor.input;
    const k = this.keys;
    const live = this.active() && actor.alive;
    if (!live) {
      inp.forward = 0;
      inp.strafe = 0;
      inp.jump = false;
      inp.walk = false;
      inp.fire = false;
      inp.use = false;
      // Discard queued edge inputs so they do not fire after respawn.
      this.pendingReload = this.pendingScope = this.pendingLast = this.pendingDrop = false;
      this.pendingSlot = null;
      this.wheel = 0;
      this.lookX = this.lookY = 0;
      return;
    }
    inp.forward = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    inp.strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    inp.jump = k.has('Space');
    inp.walk = k.has('ShiftLeft') || k.has('ShiftRight');
    inp.use = k.has('KeyE');
    inp.fire = this.fireHeld && !this.buyOpen;
    if (this.pendingReload) inp.reload = true;
    if (this.pendingScope) inp.scopeToggle = true;
    if (this.pendingSlot) inp.switchTo = this.pendingSlot;
    if (this.pendingLast) inp.switchLast = true;
    if (this.pendingDrop) inp.drop = true;
    if (this.wheel !== 0 && slots.length > 1) {
      const i = slots.indexOf(actor.activeSlot);
      const next = (i + (this.wheel > 0 ? 1 : -1) + slots.length) % slots.length;
      inp.switchTo = slots[next];
    }
    this.pendingReload = this.pendingScope = this.pendingLast = this.pendingDrop = false;
    this.pendingSlot = null;
    this.wheel = 0;

    const sens = BASE_SENS * this.sensitivity * fovScale;
    actor.yaw -= this.lookX * sens;
    actor.pitch = clamp(actor.pitch - this.lookY * sens, -PITCH_LIMIT, PITCH_LIMIT);
    this.lookX = 0;
    this.lookY = 0;
  }
}
