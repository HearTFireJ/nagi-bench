/**
 * Keyboard / mouse input with pointer lock. The engine polls state each fixed step;
 * one-shot presses are queued so none are lost between frames.
 */
export class Input {
  private keys = new Set<string>();
  private pressedQueue: string[] = [];
  private buttons = new Set<number>();
  private buttonQueue: number[] = [];
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  /** Called when the pointer lock state changes. */
  onLockChange: ((locked: boolean) => void) | null = null;
  /** Called on any user gesture (used to unlock audio). */
  onGesture: (() => void) | null = null;
  private element: HTMLElement | null = null;
  private enabled = true;

  attach(el: HTMLElement) {
    this.element = el;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    el.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.preventDefault);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    window.addEventListener('blur', this.onBlur);
  }

  detach() {
    const el = this.element;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    if (el) {
      el.removeEventListener('mousedown', this.onMouseDown);
      el.removeEventListener('wheel', this.onWheel);
      el.removeEventListener('contextmenu', this.preventDefault);
    }
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    window.removeEventListener('blur', this.onBlur);
    this.element = null;
  }

  /** Disable gameplay input (e.g. while a React menu is open). */
  setEnabled(v: boolean) {
    this.enabled = v;
    if (!v) {
      this.keys.clear();
      this.buttons.clear();
      this.pressedQueue.length = 0;
      this.buttonQueue.length = 0;
    }
  }

  requestLock() {
    if (this.element && !this.locked) {
      // Newer browsers accept options (raw mouse input); older ones take no arguments.
      const el = this.element as unknown as { requestPointerLock: (o?: unknown) => unknown };
      try {
        const p = el.requestPointerLock({ unadjustedMovement: true }) as Promise<void> | undefined;
        if (p && typeof p.catch === 'function') p.catch(() => el.requestPointerLock());
      } catch {
        el.requestPointerLock();
      }
    }
  }

  releaseLock() {
    if (this.locked && document.exitPointerLock) document.exitPointerLock();
  }

  isDown(code: string) {
    return this.keys.has(code);
  }

  isButton(b: number) {
    return this.buttons.has(b);
  }

  /** Drain queued one-shot key presses. */
  takePressed(): string[] {
    const out = this.pressedQueue;
    this.pressedQueue = [];
    return out;
  }

  takeButtonPresses(): number[] {
    const out = this.buttonQueue;
    this.buttonQueue = [];
    return out;
  }

  /** Read and reset accumulated mouse motion. */
  takeMouse(): { dx: number; dy: number; wheel: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY, wheel: this.wheel };
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    return r;
  }

  private preventDefault = (e: Event) => e.preventDefault();

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (e.repeat) return;
    this.onGesture?.();
    if (!this.enabled && e.code !== 'Escape' && e.code !== 'KeyB' && e.code !== 'Tab') return;
    if (!this.keys.has(e.code)) this.pressedQueue.push(e.code);
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    this.onGesture?.();
    if (!this.locked) return;
    e.preventDefault();
    this.buttons.add(e.button);
    this.buttonQueue.push(e.button);
  };

  private onMouseUp = (e: MouseEvent) => {
    this.buttons.delete(e.button);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.locked) return;
    e.preventDefault();
    this.wheel += Math.sign(e.deltaY);
  };

  private onPointerLockChange = () => {
    this.locked = document.pointerLockElement === this.element;
    if (!this.locked) {
      this.buttons.clear();
      this.keys.clear();
    }
    this.onLockChange?.(this.locked);
  };

  private onBlur = () => {
    this.keys.clear();
    this.buttons.clear();
  };
}
