import * as THREE from "three";
import type {
  Actor,
  Bomb,
  GunState,
  HitZone,
  Options,
  Snapshot,
  Team,
  WeaponId,
  Kill,
} from "./types";
import {
  groundHeight,
  SOLIDS,
  moveWithCollision,
  raySolid,
  siteAt,
  locationAt,
  SITE_A,
  SITE_B,
} from "./map";
import { Navigation } from "./navigation";
import { calculateDamage, WEAPONS } from "./weapons";
import { humanoid, weaponModel, disposeMaterials } from "./models";
import { World } from "./world";
import { AudioBank } from "./audio";
const DEFAULT_OPTIONS: Options = {
  team: "CT",
  pistol: false,
  primary: "m4",
  secondary: "default",
  sensitivity: 1,
  volume: 0.65,
};
const names = [
  "YOU",
  "ATLAS",
  "NOVA",
  "GHOST",
  "VIPER",
  "FALCON",
  "RAVEN",
  "ECHO",
  "WOLF",
  "ONYX",
];
interface Effect {
  object: THREE.Object3D;
  until: number;
  velocity?: THREE.Vector3;
}
export class GameEngine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(78, 1, 0.04, 200);
  viewScene = new THREE.Scene();
  viewCamera = new THREE.PerspectiveCamera(65, 1, 0.02, 10);
  hand = new THREE.Group();
  flash: THREE.Mesh;
  world: World;
  nav = new Navigation();
  audio = new AudioBank();
  actors: Actor[] = [];
  options: Options = { ...DEFAULT_OPTIONS };
  playerId = 0;
  phase: Snapshot["phase"] = "menu";
  locked = false;
  time = 0;
  timer = 115;
  round = 1;
  score = { CT: 0, T: 0 };
  winner: Team | null = null;
  reason = "";
  overAt = 0;
  freezeUntil = 0;
  bomb: Bomb = {
    state: "carried",
    carrier: null,
    x: 0,
    z: 29,
    remaining: 40,
    site: null,
  };
  feed: Kill[] = [];
  seen = new Map<number, number>();
  effects: Effect[] = [];
  keys = new Set<string>();
  mouseDown = false;
  trigger = false;
  scoped = false;
  spread = 0;
  recoil = 0;
  hitUntil = 0;
  damageUntil = 0;
  flashUntil = 0;
  actionMessage = "";
  msgUntil = 0;
  private frame = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private hudAt = 0;
  private beeper = 0;
  private emit: (s: Snapshot) => void;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private oldSlot = 1;
  private look = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private previewTime = 0;
  constructor(
    public host: HTMLDivElement,
    onChange: (s: Snapshot) => void,
  ) {
    this.emit = onChange;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.17;
    this.renderer.autoClear = false;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xb6ccd0);
    this.scene.fog = new THREE.Fog(0xb6ccd0, 48, 120);
    const hemi = new THREE.HemisphereLight(0xddebf1, 0xa58a60, 2.4);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe1b1, 3.2);
    sun.position.set(-26, 55, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -48;
    sun.shadow.camera.right = 48;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.world = new World(this.scene);
    this.viewScene.add(new THREE.HemisphereLight(0xe4f4ff, 0xa59675, 3));
    const handLight = new THREE.DirectionalLight(0xffecd5, 3);
    handLight.position.set(-2, 3, 4);
    this.viewScene.add(handLight);
    this.viewScene.add(this.hand);
    this.flash = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.085, 0),
      new THREE.MeshBasicMaterial({ color: 0xffdb8b }),
    );
    this.flash.visible = false;
    this.viewScene.add(this.flash);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    this.resize();
    document.addEventListener("pointerlockchange", this.onLock);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("contextmenu", this.onContext);
    window.addEventListener("blur", this.onBlur);
    this.resetRound();
    this.frame = requestAnimationFrame(this.loop);
    this.pushSnapshot();
  }
  get player() {
    return this.actors.find((a) => a.id === this.playerId)!;
  }
  get gun() {
    return this.player.guns[this.player.slot]!;
  }
  resize = () => {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.updateProjectionMatrix();
  };
  begin(options: Options) {
    this.options = { ...options };
    this.audio.init();
    this.audio.setVolume(options.volume);
    this.phase = "playing";
    this.score = { CT: 0, T: 0 };
    this.round = 1;
    this.resetRound();
    this.lock();
    this.pushSnapshot();
  }
  lock() {
    if (this.phase === "menu") return;
    this.audio.init();
    const p = this.renderer.domElement.requestPointerLock();
    if (p)
      p.catch(() => {
        this.actionMessage = "点击继续以捕获鼠标";
        this.pushSnapshot();
      });
  }
  returnToMenu() {
    this.phase = "menu";
    document.exitPointerLock();
    this.pushSnapshot();
  }
  nextRound() {
    this.round++;
    this.phase = "playing";
    this.resetRound();
    this.pushSnapshot();
  }
  resetRound() {
    for (const a of this.actors) {
      this.scene.remove(a.model);
      this.disposeObject(a.model);
    }
    this.actors = [];
    this.playerId = 0;
    this.winner = null;
    this.reason = "";
    this.timer = 115;
    this.freezeUntil = this.time + 3;
    this.feed = [];
    this.seen.clear();
    this.scoped = false;
    this.spread = 0;
    this.recoil = 0;
    this.mouseDown = false;
    this.trigger = false;
    for (let i = 0; i < 10; i++) {
      const team: Team =
        i < 5 ? this.options.team : this.options.team === "CT" ? "T" : "CT";
      const j = i % 5,
        t = team === "T";
      const pos = new THREE.Vector3(
        (j - 2) * 1.45,
        0,
        t ? 30 + (j % 2) * 1.6 : -23 + (j % 2) * 1.6,
      );
      const pistol = this.options.pistol && this.round === 1;
      const primary: WeaponId =
        i === 0 ? this.options.primary : j === 4 ? "awp" : t ? "ak" : "m4";
      const sidearm: WeaponId = pistol
        ? t
          ? "glock"
          : "usp"
        : i === 0 && this.options.secondary === "deagle"
          ? "deagle"
          : t
            ? "glock"
            : "usp";
      const createGun = (id: WeaponId): GunState => ({
        id,
        ammo: WEAPONS[id].magazine,
        reserve: WEAPONS[id].reserve,
        nextShot: 0,
        reloadUntil: 0,
      });
      const guns = [
        pistol ? null : createGun(primary),
        createGun(sidearm),
        createGun("knife"),
      ];
      const slot = pistol ? 1 : 0;
      const { root, limbs } = humanoid(team, i, guns[slot]!.id);
      root.position.copy(pos);
      this.scene.add(root);
      this.actors.push({
        id: i,
        name: i === 0 ? "YOU" : names[i],
        team,
        pos,
        yaw: t ? 0 : Math.PI,
        pitch: 0,
        hp: 100,
        armor: pistol ? 0 : 100,
        alive: true,
        vy: 0,
        grounded: true,
        guns,
        slot,
        model: root,
        limbs,
        state: "advance",
        target: null,
        path: [],
        thinkAt: this.time + j * 0.04,
        routeAt: 0,
        action: 0,
        actionKind: null,
        kills: 0,
        deaths: 0,
        moving: false,
        stepAt: 0,
        lastPos: pos.clone(),
        stuck: 0,
      });
    }
    const carrier =
      this.options.team === "T"
        ? this.actors[0]
        : this.actors.find((a) => a.team === "T")!;
    this.bomb = {
      state: "carried",
      carrier: carrier.id,
      x: carrier.pos.x,
      z: carrier.pos.z,
      remaining: 40,
      site: null,
    };
    this.world.bomb.visible = false;
    this.refreshHand();
    this.actionMessage = "行动开始 · 守住你的阵线";
    this.msgUntil = this.time + 5;
  }
  refreshHand() {
    for (const child of [...this.hand.children]) {
      this.hand.remove(child);
      this.disposeObject(child);
    }
    const model = weaponModel(this.gun.id, true, this.player.team);
    model.scale.setScalar(0.72);
    this.hand.add(model);
    this.hand.position.set(0.24, -0.27, -0.48);
  }
  switchWeapon(slot: number) {
    const p = this.player;
    if (!p.alive || !p.guns[slot] || p.slot === slot) return;
    p.guns[p.slot]!.reloadUntil = 0;
    this.oldSlot = p.slot;
    p.slot = slot;
    this.scoped = false;
    this.refreshHand();
    this.syncGun(p);
  }
  syncGun(a: Actor) {
    const old = a.model.getObjectByName("gun");
    if (old) {
      a.model.remove(old);
      this.disposeObject(old);
    }
    const m = weaponModel(a.guns[a.slot]!.id);
    m.name = "gun";
    m.position.set(0.14, 1.17, -0.43);
    m.scale.setScalar(0.8);
    a.model.add(m);
  }
  reload(a = this.player) {
    const g = a.guns[a.slot]!,
      w = WEAPONS[g.id];
    if (
      !a.alive ||
      g.id === "knife" ||
      g.reloadUntil ||
      g.ammo === w.magazine ||
      !g.reserve
    )
      return;
    g.reloadUntil = this.time + w.reload;
    a.action = 0;
    a.actionKind = null;
    if (a.id === this.playerId) {
      this.scoped = false;
      this.audio.reload();
    }
  }
  takeover() {
    if (this.player.alive) return;
    const allies = this.actors.filter(
      (a) => a.alive && a.team === this.options.team && a.id !== this.playerId,
    );
    if (!allies.length) return;
    this.playerId = allies[0].id;
    this.player.action = 0;
    this.player.actionKind = null;
    this.player.target = null;
    this.scoped = false;
    this.refreshHand();
    this.actionMessage = `已接管 ${this.player.name}`;
    this.msgUntil = this.time + 3;
    this.pushSnapshot();
  }
  onLock = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement;
    if (!this.locked) {
      this.keys.clear();
      this.mouseDown = false;
      this.trigger = false;
    }
    this.pushSnapshot();
  };
  onMouseMove = (e: MouseEvent) => {
    if (!this.locked || !this.player.alive || this.phase !== "playing") return;
    const speed = 0.0021 * this.options.sensitivity * (this.scoped ? 0.33 : 1);
    this.player.yaw -= e.movementX * speed;
    this.player.pitch = THREE.MathUtils.clamp(
      this.player.pitch - e.movementY * speed,
      -1.42,
      1.42,
    );
  };
  onMouseDown = (e: MouseEvent) => {
    if (!this.locked || this.phase !== "playing") return;
    if (e.button === 0) {
      this.mouseDown = true;
      this.trigger = true;
    }
    if (e.button === 2 && this.gun.id === "awp" && !this.gun.reloadUntil) {
      this.scoped = !this.scoped;
      this.audio.scope();
    }
  };
  onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
  };
  onContext = (e: Event) => {
    if (this.locked) e.preventDefault();
  };
  onBlur = () => {
    this.keys.clear();
    this.mouseDown = false;
    if (this.locked) document.exitPointerLock();
  };
  onKeyDown = (e: KeyboardEvent) => {
    if (!this.locked) return;
    if (["Space", "Tab", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code))
      e.preventDefault();
    this.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "KeyR") this.reload();
    if (e.code === "Digit1") this.switchWeapon(0);
    if (e.code === "Digit2") this.switchWeapon(1);
    if (e.code === "Digit3") this.switchWeapon(2);
    if (e.code === "KeyQ") this.switchWeapon(this.oldSlot);
    if (e.code === "KeyF") this.takeover();
    if (
      e.code === "Space" &&
      this.player.alive &&
      this.player.grounded &&
      this.phase === "playing"
    ) {
      this.player.vy = 6;
      this.player.grounded = false;
    }
  };
  onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  loop = (ms: number) => {
    if (this.disposed) return;
    const dt = Math.min((ms - (this.lastFrame || ms)) / 1000, 0.1);
    this.lastFrame = ms;
    if (this.locked && this.phase !== "menu") {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= 1 / 60 && steps++ < 7) {
        this.update(1 / 60);
        this.accumulator -= 1 / 60;
      }
    } else this.accumulator = 0;
    this.previewTime += dt;
    this.render();
    if (ms - this.hudAt > 70) {
      this.hudAt = ms;
      this.pushSnapshot();
    }
    this.frame = requestAnimationFrame(this.loop);
  };
  update(dt: number) {
    this.time += dt;
    for (const fx of [...this.effects]) {
      if (fx.velocity) {
        fx.object.position.addScaledVector(fx.velocity, dt);
        fx.velocity.y -= 6 * dt;
      }
      if (this.time > fx.until) {
        this.scene.remove(fx.object);
        this.disposeObject(fx.object);
        this.effects.splice(this.effects.indexOf(fx), 1);
      }
    }
    if (this.phase === "over") {
      if (this.time - this.overAt > 7) this.nextRound();
      return;
    }
    if (this.time < this.freezeUntil) return;
    this.timer -= dt;
    const p = this.player;
    if (p.alive) {
      const f = Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS")),
        s = Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA"));
      const length = Math.hypot(f, s) || 1,
        speed =
          (this.keys.has("ShiftLeft")
            ? 2.2
            : this.gun.id === "knife"
              ? 5.6
              : this.scoped
                ? 2.3
                : 4.7) * (p.actionKind ? 0.08 : 1);
      moveWithCollision(
        p.pos,
        ((-Math.sin(p.yaw) * f + Math.cos(p.yaw) * s) / length) * speed * dt,
        ((-Math.cos(p.yaw) * f - Math.sin(p.yaw) * s) / length) * speed * dt,
      );
      p.moving = !!(f || s);
      this.vertical(p, dt);
      const w = WEAPONS[this.gun.id];
      if (this.trigger || (this.mouseDown && w.auto)) {
        this.fire(p);
        this.trigger = false;
      }
      this.updateAction(
        p,
        this.keys.has("KeyE") &&
          !this.mouseDown &&
          !this.gun.reloadUntil &&
          !(f || s),
        dt,
      );
    }
    for (const a of this.actors) {
      if (!a.alive) continue;
      for (const g of a.guns)
        if (g?.reloadUntil && this.time >= g.reloadUntil) {
          const n = Math.min(WEAPONS[g.id].magazine - g.ammo, g.reserve);
          g.ammo += n;
          g.reserve -= n;
          g.reloadUntil = 0;
        }
      if (a.id !== this.playerId) this.updateAI(a, dt);
      a.model.position.copy(a.pos);
      a.model.rotation.y = a.yaw;
      for (const leg of a.limbs.filter((m) => m.name.startsWith("leg")))
        leg.rotation.x = a.moving
          ? Math.sin(this.time * 11 + (leg.name === "leg1" ? Math.PI : 0)) * 0.3
          : 0;
      if (a.moving && this.time > a.stepAt && a.grounded) {
        a.stepAt =
          this.time +
          (a.id === this.playerId && this.keys.has("ShiftLeft") ? 0.56 : 0.36);
        const d = a.pos.distanceTo(p.pos);
        if (d < 16)
          this.audio.step(
            a.id === this.playerId ? 0.17 : 0.13 * (1 - d / 16),
            this.soundPan(a.pos),
          );
      }
    }
    this.spread = Math.max(0, this.spread - dt * 0.025);
    const recovery = Math.min(this.recoil, dt * 0.027);
    this.recoil -= recovery;
    p.pitch -= recovery;
    this.updateBomb(dt);
    if (this.timer <= 0 && this.bomb.state !== "planted")
      this.finish("CT", "时间耗尽 · 包点安全");
    const ct = this.actors.some((a) => a.team === "CT" && a.alive),
      t = this.actors.some((a) => a.team === "T" && a.alive);
    if (!ct) this.finish("T", "反恐精英全部阵亡");
    else if (!t && this.bomb.state !== "planted")
      this.finish("CT", "恐怖分子全部阵亡");
  }
  vertical(a: Actor, dt: number) {
    let support = groundHeight(a.pos.x, a.pos.z);
    for (const s of SOLIDS)
      if (
        s.kind === "crate" &&
        Math.abs(a.pos.x - s.x) < s.w / 2 + 0.2 &&
        Math.abs(a.pos.z - s.z) < s.d / 2 + 0.2 &&
        a.pos.y >= s.y + s.h - 0.02
      )
        support = Math.max(support, s.y + s.h);
    if (a.pos.y <= support && a.vy <= 0) {
      a.pos.y = support;
      a.vy = 0;
      a.grounded = true;
      return;
    }
    a.vy -= 17 * dt;
    const next = a.pos.y + a.vy * dt;
    if (next <= support) {
      a.pos.y = support;
      a.vy = 0;
      a.grounded = true;
    } else {
      a.pos.y = next;
      a.grounded = false;
    }
  }
  visible(a: Actor, b: Actor) {
    const origin = a.pos.clone().add(new THREE.Vector3(0, 1.55, 0)),
      dest = b.pos.clone().add(new THREE.Vector3(0, 1.35, 0));
    const dir = dest.sub(origin),
      d = dir.length();
    if (d > 62) return false;
    dir.normalize();
    if (d > 7 && dir.x * -Math.sin(a.yaw) + dir.z * -Math.cos(a.yaw) < 0.12)
      return false;
    return raySolid(origin, dir, d) >= d - 0.08;
  }
  updateAI(a: Actor, dt: number) {
    if (this.time >= a.thinkAt) {
      a.thinkAt = this.time + 0.18 + (a.id % 3) * 0.025;
      const enemies = this.actors
        .filter((b) => b.alive && b.team !== a.team && this.visible(a, b))
        .sort(
          (b, c) =>
            b.pos.distanceToSquared(a.pos) - c.pos.distanceToSquared(a.pos),
        );
      const target = enemies[0];
      if (target && a.target !== target.id)
        a.guns[a.slot]!.nextShot = Math.max(
          a.guns[a.slot]!.nextShot,
          this.time + 0.3,
        );
      a.target = target?.id ?? null;
      if (target) {
        a.state = "engage";
        if (a.team === this.options.team)
          this.seen.set(target.id, this.time + 1.8);
      } else if (this.bomb.state === "planted")
        a.state = a.team === "CT" ? "defuse" : "guard";
      else if (a.team === "T" && this.bomb.state === "dropped")
        a.state = "recover";
      else if (a.id === this.bomb.carrier && siteAt(a.pos.x, a.pos.z))
        a.state = "plant";
      else a.state = "advance";
      const g = a.guns[a.slot]!;
      if (g.id !== "knife" && !g.ammo && !g.reserve && a.slot === 0) {
        a.slot = 1;
        this.syncGun(a);
      }
      if (!a.guns[a.slot]!.ammo && a.guns[a.slot]!.id !== "knife")
        this.reload(a);
    }
    a.moving = false;
    if (a.target !== null) {
      const target = this.actors[a.target];
      if (target?.alive && this.visible(a, target)) {
        const dx = target.pos.x - a.pos.x,
          dz = target.pos.z - a.pos.z,
          d = Math.hypot(dx, dz);
        a.yaw = Math.atan2(-dx, -dz);
        a.pitch = Math.atan2(target.pos.y + 1.25 - (a.pos.y + 1.5), d);
        a.action = 0;
        a.actionKind = null;
        this.fire(a);
        if (d < 4.5) {
          moveWithCollision(a.pos, (-dx / d) * dt * 1.1, (-dz / d) * dt * 1.1);
          a.moving = true;
        }
        return;
      }
    }
    if (
      (a.state === "plant" || a.state === "defuse") &&
      this.updateAction(a, true, dt)
    )
      return;
    a.action = 0;
    a.actionKind = null;
    let goal: { x: number; z: number };
    const site = this.round % 2 === 1 ? SITE_A : SITE_B;
    if (a.state === "recover" || a.state === "defuse") goal = this.bomb;
    else if (a.state === "guard") {
      const offsets = [
        [-4, -3],
        [4, 3],
        [0, 4],
        [-3, 3],
        [3, -3],
      ];
      const o = offsets[a.id % 5];
      goal = { x: this.bomb.x + o[0], z: this.bomb.z + o[1] };
    } else if (a.team === "T") {
      if (a.id === this.bomb.carrier)
        goal = { x: site.x + (site === SITE_A ? 1 : -1), z: site.z + 1 };
      else if (this.bomb.carrier !== null && a.id % 5 < 3)
        goal = this.actors[this.bomb.carrier].pos;
      else goal = a.id % 2 === 0 ? { x: 0, z: -14 } : site;
    } else {
      const goals = [SITE_A, SITE_A, { x: 0, z: -1 }, SITE_B, SITE_B];
      goal = goals[a.id % 5];
      if (a.pos.distanceTo(new THREE.Vector3(goal.x, 0, goal.z)) < 3) {
        // Patrol between cover positions instead of remaining permanently stationary.
        const t = Math.floor(this.time / 9) % 2;
        goal = { x: goal.x + (t ? 3 : -3), z: goal.z + (t ? 4 : -2) };
      }
    }
    if (this.time >= a.routeAt || !a.path.length) {
      a.path = this.nav.find(a.pos, goal);
      a.routeAt = this.time + 1.8 + a.id * 0.03;
    }
    const node = a.path[0];
    if (node) {
      const dx = node.x - a.pos.x,
        dz = node.z - a.pos.z,
        d = Math.hypot(dx, dz);
      if (d < 0.22) a.path.shift();
      else {
        a.yaw = Math.atan2(-dx, -dz);
        a.pitch = 0;
        moveWithCollision(
          a.pos,
          (dx / d) * dt * 3.2,
          (dz / d) * dt * 3.2,
          0.34,
        );
        a.moving = true;
        if (a.lastPos.distanceToSquared(a.pos) < 0.00001) a.stuck += dt;
        else a.stuck = 0;
        if (a.stuck > 0.6) {
          a.path = [];
          a.routeAt = 0;
          a.stuck = 0;
        }
        a.lastPos.copy(a.pos);
      }
    }
    this.vertical(a, dt);
    if (!node || !a.moving)
      a.yaw += Math.sin(this.time * 0.8 + a.id) * dt * 0.4;
  }
  updateAction(a: Actor, held: boolean, dt: number) {
    let kind: Actor["actionKind"] = null;
    if (a.guns[a.slot]?.reloadUntil) held = false;
    if (
      held &&
      a.alive &&
      a.team === "T" &&
      this.bomb.state === "carried" &&
      this.bomb.carrier === a.id &&
      siteAt(a.pos.x, a.pos.z) &&
      a.grounded
    )
      kind = "plant";
    if (
      held &&
      a.alive &&
      a.team === "CT" &&
      this.bomb.state === "planted" &&
      Math.hypot(a.pos.x - this.bomb.x, a.pos.z - this.bomb.z) < 2.5 &&
      a.grounded &&
      raySolid(
        a.pos.clone().add(new THREE.Vector3(0, 0.5, 0)),
        new THREE.Vector3(
          this.bomb.x - a.pos.x,
          -0.35,
          this.bomb.z - a.pos.z,
        ).normalize(),
        Math.hypot(a.pos.x - this.bomb.x, a.pos.z - this.bomb.z),
      ) >=
        Math.hypot(a.pos.x - this.bomb.x, a.pos.z - this.bomb.z) - 0.1
    )
      kind = "defuse";
    if (!kind) {
      a.action = 0;
      a.actionKind = null;
      return false;
    }
    if (a.actionKind !== kind) {
      a.action = 0;
      a.actionKind = kind;
      if (a.id === this.playerId) this.audio.plant();
    }
    a.action += dt;
    if (kind === "plant" && a.action >= 3.2) {
      this.bomb = {
        state: "planted",
        carrier: null,
        x: a.pos.x,
        z: a.pos.z,
        remaining: 40,
        site: siteAt(a.pos.x, a.pos.z),
      };
      this.audio.plant();
      this.actionMessage = `C4 已安放在 ${this.bomb.site} 点`;
      this.msgUntil = this.time + 4;
      a.action = 0;
      a.actionKind = null;
    } else if (kind === "defuse" && a.action >= 5) {
      this.bomb.state = "defused";
      this.audio.defuse();
      this.finish("CT", "C4 拆除成功");
      a.action = 0;
      a.actionKind = null;
    }
    return true;
  }
  updateBomb(dt: number) {
    if (this.bomb.state === "carried" && this.bomb.carrier !== null) {
      const a = this.actors[this.bomb.carrier];
      this.bomb.x = a.pos.x;
      this.bomb.z = a.pos.z;
    }
    if (this.bomb.state === "dropped") {
      const a = this.actors.find(
        (a) =>
          a.alive &&
          a.team === "T" &&
          Math.hypot(a.pos.x - this.bomb.x, a.pos.z - this.bomb.z) < 1.35,
      );
      if (a) {
        this.bomb.state = "carried";
        this.bomb.carrier = a.id;
        if (a.id === this.playerId) {
          this.actionMessage = "你拾取了 C4";
          this.msgUntil = this.time + 3;
        }
      }
    }
    if (this.bomb.state === "planted") {
      this.bomb.remaining -= dt;
      if (this.time > this.beeper) {
        this.audio.beep(this.bomb.remaining < 10);
        this.beeper = this.time + Math.max(0.13, this.bomb.remaining / 40);
      }
      if (this.bomb.remaining <= 0) {
        this.bomb.state = "exploded";
        this.audio.explosion();
        this.burst(
          new THREE.Vector3(this.bomb.x, 0.5, this.bomb.z),
          0xffa13b,
          32,
          2.5,
        );
        this.finish("T", "C4 引爆 · 目标摧毁");
      }
    }
    this.world.bomb.visible =
      this.bomb.state === "planted" || this.bomb.state === "dropped";
    this.world.bomb.position.set(
      this.bomb.x,
      groundHeight(this.bomb.x, this.bomb.z),
      this.bomb.z,
    );
    this.world.bombLight.visible =
      Math.sin(this.time * (this.bomb.remaining < 10 ? 25 : 7)) > 0;
  }
  fire(a: Actor) {
    const g = a.guns[a.slot]!,
      w = WEAPONS[g.id];
    if (!a.alive || a.actionKind || this.time < g.nextShot || g.reloadUntil)
      return;
    if (g.id !== "knife" && g.ammo <= 0) {
      if (a.id === this.playerId) this.reload(a);
      return;
    }
    const self = a.id === this.playerId;
    g.nextShot = this.time + w.interval;
    if (g.id !== "knife") g.ammo--;
    const origin = a.pos
      .clone()
      .add(new THREE.Vector3(0, self ? 1.64 : 1.5, 0));
    const spread = self
      ? (g.id === "awp" && this.scoped ? 0.0008 : w.spread + this.spread) +
        (a.moving ? 0.012 : 0)
      : w.spread * 0.5 + 0.013;
    const yaw = a.yaw + (Math.random() - 0.5) * spread * 2,
      pitch = a.pitch + (Math.random() - 0.5) * spread * 2;
    const direction = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    const distance = raySolid(origin, direction, w.range);
    this.ray.set(origin, direction);
    this.ray.far = distance;
    for (const actor of this.actors) {
      actor.model.position.copy(actor.pos);
      actor.model.rotation.y = actor.yaw;
      actor.model.updateMatrixWorld(true);
    }
    const limbs = this.actors
      .filter((b) => b.alive && b.id !== a.id)
      .flatMap((b) => b.limbs);
    const hits = this.ray.intersectObjects(limbs, false);
    const hit = hits[0];
    let endpoint = origin.clone().addScaledVector(direction, distance);
    if (hit) {
      endpoint = hit.point;
      const target = this.actors[hit.object.userData.actor as number];
      if (target.team !== a.team) {
        const zone = hit.object.userData.zone as HitZone;
        this.damage(target, a, g.id, zone);
        if (self) {
          this.hitUntil = this.time + 0.14;
          this.audio.hit();
        }
        this.burst(endpoint, 0xa36943, 4);
      }
    } else if (distance < w.range) this.burst(endpoint, 0xd4ba87, 3);
    if (g.id !== "knife") {
      const start = origin.clone().addScaledVector(direction, 0.5);
      start.y -= 0.12;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([start, endpoint]),
        new THREE.LineBasicMaterial({
          color: 0xffd89a,
          transparent: true,
          opacity: self ? 0.35 : 0.65,
        }),
      );
      this.scene.add(line);
      this.effects.push({ object: line, until: this.time + 0.045 });
    }
    const d = a.pos.distanceTo(this.player.pos);
    if (d < 65)
      this.audio.shot(
        g.id,
        self ? 0.85 : Math.max(0.04, 0.5 * (1 - d / 65)),
        this.soundPan(a.pos),
      );
    if (self) {
      a.pitch = Math.min(1.4, a.pitch + w.recoil);
      this.recoil += w.recoil * 0.65;
      this.spread = Math.min(0.055, this.spread + w.recoil * 0.25);
      this.flashUntil = this.time + 0.045;
    } else {
      const flash = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.09, 0),
        new THREE.MeshBasicMaterial({ color: 0xffcc69 }),
      );
      flash.position.copy(origin).addScaledVector(direction, 1);
      this.scene.add(flash);
      this.effects.push({ object: flash, until: this.time + 0.045 });
    }
  }
  damage(target: Actor, attacker: Actor, weapon: WeaponId, zone: HitZone) {
    const damage = calculateDamage(weapon, zone, target.armor);
    target.armor = Math.max(0, target.armor - damage.armor);
    target.hp = Math.max(0, target.hp - damage.health);
    if (target.id === this.playerId) this.damageUntil = this.time + 0.3;
    // Incoming fire reveals the attacker only when an actual unobstructed view exists.
    if (target.id !== this.playerId && this.visible(target, attacker)) {
      target.target = attacker.id;
      target.thinkAt = this.time + 0.3;
    }
    if (target.hp > 0) return;
    target.alive = false;
    target.deaths++;
    attacker.kills++;
    target.action = 0;
    target.actionKind = null;
    target.model.rotation.z = Math.PI / 2;
    target.model.position.y = groundHeight(target.pos.x, target.pos.z) + 0.15;
    target.model.visible = target.id !== this.playerId;
    this.feed.unshift({
      id: Date.now() + target.id,
      killer: attacker.name,
      victim: target.name,
      team: attacker.team,
      weapon: WEAPONS[weapon].short,
      headshot: zone === "head",
      at: this.time,
    });
    this.feed = this.feed.slice(0, 5);
    if (attacker.id === this.playerId) this.audio.kill();
    if (this.bomb.carrier === target.id && this.bomb.state === "carried") {
      this.bomb.state = "dropped";
      this.bomb.carrier = null;
      this.bomb.x = target.pos.x;
      this.bomb.z = target.pos.z;
    }
    if (target.id === this.playerId) {
      this.scoped = false;
      this.actionMessage = "你已阵亡 · 按 F 接管存活队友";
      this.msgUntil = this.time + 20;
    }
  }
  soundPan(position: THREE.Vector3) {
    const delta = position.clone().sub(this.player.pos);
    return THREE.MathUtils.clamp(
      (delta.x * Math.cos(this.player.yaw) -
        delta.z * Math.sin(this.player.yaw)) /
        16,
      -1,
      1,
    );
  }
  burst(position: THREE.Vector3, color: number, count: number, life = 0.32) {
    for (let i = 0; i < count; i++) {
      const object = new THREE.Mesh(
        new THREE.IcosahedronGeometry(life > 1 ? 0.25 : 0.025, 0),
        new THREE.MeshBasicMaterial({ color }),
      );
      object.position.copy(position);
      this.scene.add(object);
      this.effects.push({
        object,
        until: this.time + life,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * (life > 1 ? 15 : 2),
          Math.random() * (life > 1 ? 10 : 2),
          (Math.random() - 0.5) * (life > 1 ? 15 : 2),
        ),
      });
    }
  }
  finish(team: Team, reason: string) {
    if (this.phase !== "playing") return;
    this.winner = team;
    this.reason = reason;
    this.phase = "over";
    this.score[team]++;
    this.overAt = this.time;
    this.audio.kill();
    this.pushSnapshot();
  }
  render() {
    const p = this.player;
    for (const a of this.actors)
      a.model.visible = this.phase === "menu" || a.id !== this.playerId;
    if (this.phase === "menu") {
      const sway = Math.sin(this.previewTime * 0.09) * 1.5;
      this.camera.position.set(29 + sway, 2.7, -7.5);
      this.camera.lookAt(19, 2.2, -21);
      this.camera.fov = 72;
    } else {
      const bob =
        p.moving && p.grounded && p.alive
          ? Math.sin(this.time * 12) * 0.023
          : 0;
      this.camera.position
        .copy(p.pos)
        .add(new THREE.Vector3(0, p.alive ? 1.64 + bob : 0.55, 0));
      this.camera.rotation.set(p.pitch, p.yaw, 0, "YXZ");
      this.camera.fov = this.scoped ? 24 : 78;
      this.hand.position.set(
        0.24 + Math.sin(this.time * 6) * (p.moving ? 0.012 : 0.002),
        -0.27 + Math.abs(Math.sin(this.time * 6)) * (p.moving ? 0.015 : 0.002),
        -0.48 + this.recoil * 1.2,
      );
      this.hand.rotation.set(
        this.recoil * 1.4 +
          (this.gun.reloadUntil
            ? Math.sin((this.gun.reloadUntil - this.time) * 3) * 0.25
            : 0),
        0,
        this.gun.reloadUntil ? -0.4 : 0,
      );
    }
    this.camera.updateProjectionMatrix();
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.phase !== "menu" && p.alive && !this.scoped) {
      this.flash.visible =
        this.time < this.flashUntil && this.gun.id !== "knife";
      const barrel =
        this.gun.id === "awp"
          ? -0.92
          : WEAPONS[this.gun.id].slot === 0
            ? -0.8
            : -0.24;
      this.flash.position.set(0.24, -0.255, -0.48 + barrel * 0.72);
      this.flash.rotation.z = Math.random() * Math.PI;
      this.renderer.clearDepth();
      this.renderer.render(this.viewScene, this.viewCamera);
    }
  }
  pushSnapshot() {
    if (!this.actors.length) return;
    const p = this.player,
      g = this.gun;
    if (this.phase === "playing" && p.alive)
      for (const a of this.actors)
        if (a.team !== p.team && a.alive && this.visible(p, a))
          this.seen.set(a.id, this.time + 1.8);
    let message = this.time < this.msgUntil ? this.actionMessage : "";
    if (this.time < this.freezeUntil && this.phase === "playing")
      message = `准备行动 · ${Math.ceil(this.freezeUntil - this.time)}`;
    else if (p.alive && this.phase === "playing" && !p.actionKind) {
      if (
        p.team === "T" &&
        this.bomb.carrier === p.id &&
        siteAt(p.pos.x, p.pos.z)
      )
        message = "长按 E 安放 C4";
      else if (
        p.team === "CT" &&
        this.bomb.state === "planted" &&
        Math.hypot(p.pos.x - this.bomb.x, p.pos.z - this.bomb.z) < 2.5
      )
        message = "长按 E 拆除 C4 · 5 秒";
      else if (this.bomb.carrier === p.id)
        message = "你携带 C4 · 前往 A 或 B 包点";
    }
    this.look.copy(this.camera.position);
    this.emit({
      phase: this.phase,
      locked: this.locked,
      team: p.team,
      name: p.name,
      alive: p.alive,
      health: p.hp,
      armor: p.armor,
      weapon: g.id,
      ammo: g.ammo,
      reserve: g.reserve,
      reloading: g.reloadUntil
        ? Math.max(0, g.reloadUntil - this.time) / WEAPONS[g.id].reload
        : 0,
      scoped: this.scoped,
      spread: this.spread,
      time: Math.max(0, this.timer),
      round: this.round,
      score: { ...this.score },
      ctAlive: this.actors.filter((a) => a.team === "CT" && a.alive).length,
      tAlive: this.actors.filter((a) => a.team === "T" && a.alive).length,
      bomb: { ...this.bomb },
      action: p.action / (p.actionKind === "plant" ? 3.2 : 5),
      actionKind: p.actionKind ?? "",
      message,
      winner: this.winner,
      reason: this.reason,
      feed: this.feed.filter((f) => this.time - f.at < 8),
      hit: this.time < this.hitUntil,
      damage: this.time < this.damageUntil,
      location: locationAt(p.pos.x, p.pos.z),
      players: this.actors.map((a) => ({
        id: a.id,
        name: a.name,
        team: a.team,
        alive: a.alive,
        kills: a.kills,
        deaths: a.deaths,
      })),
      dots: this.actors
        .filter(
          (a) =>
            a.team === p.team ||
            (a.alive && (this.seen.get(a.id) ?? 0) > this.time),
        )
        .map((a) => ({
          id: a.id,
          x: a.pos.x,
          z: a.pos.z,
          yaw: a.yaw,
          team: a.team,
          self: a.id === p.id,
          alive: a.alive,
        })),
    });
  }
  disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
      if (child instanceof THREE.InstancedMesh) child.dispose();
      if (child instanceof THREE.Mesh || child instanceof THREE.Line)
        child.geometry.dispose();
      if (
        child instanceof THREE.Mesh &&
        child.material instanceof THREE.MeshBasicMaterial
      ) {
        child.material.map?.dispose();
        child.material.dispose();
      }
      if (
        child instanceof THREE.Line &&
        child.material instanceof THREE.LineBasicMaterial
      )
        child.material.dispose();
    });
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    document.removeEventListener("pointerlockchange", this.onLock);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("contextmenu", this.onContext);
    window.removeEventListener("blur", this.onBlur);
    if (this.locked) document.exitPointerLock();
    this.disposeObject(this.scene);
    this.disposeObject(this.viewScene);
    this.audio.dispose();
    this.renderer.dispose();
    disposeMaterials();
    this.renderer.domElement.remove();
  }
}
