import * as THREE from "three";
import { ROOMS, SOLIDS, SITE_A, SITE_B, walkable, groundHeight } from "./map";
import { box, material } from "./models";
export class World {
  root = new THREE.Group();
  bomb = new THREE.Group();
  bombLight: THREE.Mesh;
  constructor(scene: THREE.Scene) {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      material(0xc1aa80),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);
    for (const r of ROOMS) {
      const geometry = new THREE.PlaneGeometry(
        r.w,
        r.d,
        Math.ceil(r.w * 2),
        Math.ceil(r.d * 2),
      );
      geometry.rotateX(-Math.PI / 2);
      const vertices = geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++)
        vertices.setY(
          i,
          groundHeight(r.x + vertices.getX(i), r.z + vertices.getZ(i)) + 0.002,
        );
      geometry.computeVertexNormals();
      const f = new THREE.Mesh(
        geometry,
        material(r.name.includes("洞") ? 0x99866b : 0xc7b28d),
      );
      f.position.set(r.x, 0, r.z);
      f.receiveShadow = true;
      this.root.add(f);
      // Sparse engraved floor paving, constructed as geometry.
      if (
        !r.name.includes("洞") &&
        [-1, 1].every(
          (sign) =>
            groundHeight(r.x, r.z + (sign * r.d) / 2) ===
            groundHeight(r.x, r.z),
        )
      )
        for (let x = r.x - r.w / 2 + 2; x < r.x + r.w / 2; x += 3)
          box(
            this.root,
            0.013,
            0.005,
            r.d,
            x,
            groundHeight(x, r.z) + 0.006,
            r.z,
            0xb5a181,
          ).castShadow = false;
    }
    let seed = 87;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (const s of SOLIDS) {
      const color =
        s.kind === "crate"
          ? 0x827957
          : s.kind === "door"
            ? 0x66503a
            : [0xc7af89, 0xbda17b, 0xd4bb92, 0xbfa782][
                Math.floor(random() * 4)
              ];
      box(this.root, s.w, s.h, s.d, s.x, s.y + s.h / 2, s.z, color);
      if (s.kind === "crate") {
        for (const side of [-1, 1]) {
          box(
            this.root,
            0.12,
            s.h + 0.03,
            s.d + 0.04,
            s.x + side * (s.w / 2 - 0.14),
            s.y + s.h / 2,
            s.z,
            0x494e41,
          );
          box(
            this.root,
            s.w + 0.04,
            0.12,
            s.d + 0.05,
            s.x,
            s.y + s.h / 2 + side * (s.h / 2 - 0.16),
            s.z,
            0x5b5e4b,
          );
        }
        for (let y = 0.4; y < s.h; y += 0.35)
          box(
            this.root,
            s.w - 0.2,
            0.018,
            s.d + 0.016,
            s.x,
            s.y + y,
            s.z,
            0x69674c,
          );
      } else if (s.kind === "wall") {
        box(
          this.root,
          s.w + 0.1,
          0.18,
          s.d + 0.1,
          s.x,
          s.h - 0.1,
          s.z,
          0xe1cba5,
        );
        box(this.root, s.w + 0.05, 0.3, s.d + 0.05, s.x, 0.15, s.z, 0xa88d6c);
        const alongX = s.w > s.d,
          length = Math.max(s.w, s.d);
        for (let y = 0.65; y < s.h - 0.4; y += 0.7)
          box(
            this.root,
            s.w + 0.013,
            0.012,
            s.d + 0.013,
            s.x,
            y,
            s.z,
            0xb39874,
          ).castShadow = false;
        for (let t = -length / 2 + 1.8; t < length / 2 - 0.8; t += 3.8) {
          const ix = s.x + (alongX ? t : 0.27),
            iz = s.z + (alongX ? 0.27 : t);
          const side = walkable(
            ix + (alongX ? 0 : 0.3),
            iz + (alongX ? 0.3 : 0),
          )
            ? 1
            : -1;
          const win = box(
            this.root,
            alongX ? 0.85 : 0.06,
            1.25,
            alongX ? 0.06 : 0.85,
            alongX ? ix : s.x + side * 0.26,
            3.7,
            alongX ? s.z + side * 0.26 : iz,
            0x517678,
          );
          win.castShadow = false;
          box(
            this.root,
            alongX ? 1 : 0.11,
            0.12,
            alongX ? 0.11 : 1,
            win.position.x,
            3.05,
            win.position.z,
            0xe0c6a2,
          );
          for (let k = -0.3; k <= 0.3; k += 0.15)
            box(
              this.root,
              alongX ? 0.025 : 0.075,
              1.14,
              alongX ? 0.075 : 0.025,
              win.position.x + (alongX ? k : 0),
              3.7,
              win.position.z + (alongX ? 0 : k),
              0x3e6061,
            ).castShadow = false;
        }
      } else {
        for (let y = 0.3; y < 3; y += 0.35)
          box(this.root, s.w + 0.02, 0.02, s.d + 0.025, s.x, y, s.z, 0x403a2e);
        box(this.root, s.w + 0.03, 0.1, s.d + 0.05, s.x, 0.65, s.z, 0x2d3330);
        box(this.root, s.w + 0.03, 0.1, s.d + 0.05, s.x, 2.5, s.z, 0x2d3330);
      }
    }
    // Mid-door lintel leaves the whole player-height opening unobstructed.
    box(this.root, 8, 0.9, 0.9, 0, 4.7, -5, 0xc6ab82);
    this.arch(0, -5, 3.4, 3.1);
    // B tunnel roof, with an open exit and connected lower tunnel.
    box(this.root, 8, 0.3, 23, -23, 4.7, 14, 0x8f7f65);
    for (let z = 5; z <= 23; z += 5) this.arch(-23, z, 3.5, 3.5);
    const tunnelLight = new THREE.PointLight(0xffc77b, 10, 16, 2);
    tunnelLight.position.set(-23, 3.9, 14);
    this.root.add(tunnelLight);
    box(this.root, 0.4, 0.07, 0.5, -23, 4.1, 14, 0xffcf86);
    // Raised curb gives catwalk its recognizable narrow, bent silhouette.
    for (let z = -9.5; z < 3; z += 0.5)
      box(
        this.root,
        0.18,
        0.22,
        0.5,
        7.55,
        groundHeight(7.55, z) + 0.11,
        z,
        0x9a8162,
      );
    for (const [site, letter] of [
      [SITE_A, "A"],
      [SITE_B, "B"],
    ] as const) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(5.25, 5.34, 64),
        new THREE.MeshBasicMaterial({
          color: 0xca6f3e,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(site.x, groundHeight(site.x, site.z) + 0.012, site.z);
      this.root.add(ring);
      this.sign(
        letter,
        site.x,
        groundHeight(site.x, site.z + 2) + 0.017,
        site.z + 2,
        3,
        true,
      );
    }
    this.sign("A  →", 19.25, 2.3, 23.15, 2.5);
    this.sign("B  ←", -10, 2.2, 30.85, 2.5);
    this.sign("A", 23.4, 2.1, -24.75, 1.7);
    this.sign("B", -23, 2.1, -25.75, 1.7);
    this.sign("DUST II", 4.7, 2.7, 34.75, 3.5);
    // Procedural skyline outside the playable boundary.
    for (const [x, z, w, d, h] of [
      [39, -17, 9, 14, 8],
      [23, -32, 18, 10, 8],
      [-24, -33, 21, 8, 9],
      [-39, -13, 8, 22, 7],
      [38, 19, 8, 14, 7],
      [10, 42, 18, 9, 8],
      [-16, 42, 15, 8, 7],
    ]) {
      box(this.root, w, h, d, x, h / 2, z, 0xc8b18b);
      box(this.root, w + 0.4, 0.25, d + 0.4, x, h, z, 0xdfc9a5);
      for (let i = -w / 2 + 1.5; i < w / 2; i += 3)
        box(
          this.root,
          0.8,
          1.7,
          0.06,
          x + i,
          h - 2,
          z + d / 2 + 0.035,
          0x4e7476,
        );
    }
    // Domed tower and palms are built exclusively from geometry.
    box(this.root, 6, 9, 6, 37, 4.5, -29, 0xcbb895);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      material(0xa0b3ae),
    );
    dome.position.set(37, 9, -29);
    this.root.add(dome);
    for (const [x, z] of [
      [35, 7],
      [36, -23],
      [-37, -20],
      [15, 38],
    ])
      this.palm(x, z);
    // Utility wire across the sky.
    const wire = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        Array.from(
          { length: 31 },
          (_, i) =>
            new THREE.Vector3(
              -8 + i * 1.45,
              8 - Math.sin((i / 30) * Math.PI) * 1.5,
              -27,
            ),
        ),
      ),
      new THREE.LineBasicMaterial({ color: 0x4d5148 }),
    );
    this.root.add(wire);
    // C4 model.
    box(this.bomb, 0.32, 0.14, 0.22, 0, 0.09, 0, 0x384236);
    for (let i = 0; i < 3; i++)
      box(this.bomb, 0.065, 0.07, 0.18, -0.1 + i * 0.1, 0.18, 0, 0x7f8461);
    box(this.bomb, 0.12, 0.055, 0.09, 0, 0.22, 0.025, 0x242c25);
    this.bombLight = box(
      this.bomb,
      0.025,
      0.012,
      0.025,
      0.09,
      0.226,
      0.03,
      0xe94f37,
    );
    this.bomb.visible = false;
    this.root.add(this.bomb);
    this.batchStaticBoxes();
    scene.add(this.root);
  }
  /** Static geometry is instanced by material to keep the whole map below 70 draw calls. */
  batchStaticBoxes() {
    const groups = new Map<string, THREE.Mesh[]>();
    for (const child of this.root.children) {
      if (
        !(child instanceof THREE.Mesh) ||
        !(child.geometry instanceof THREE.BoxGeometry)
      )
        continue;
      const key = `${(child.material as THREE.Material).uuid}:${child.castShadow}`;
      const list = groups.get(key) ?? [];
      list.push(child);
      groups.set(key, list);
    }
    const cube = new THREE.BoxGeometry(1, 1, 1),
      matrix = new THREE.Matrix4(),
      size = new THREE.Vector3();
    for (const list of groups.values()) {
      const batch = new THREE.InstancedMesh(
        cube,
        list[0].material,
        list.length,
      );
      batch.castShadow = list[0].castShadow;
      batch.receiveShadow = true;
      list.forEach((mesh, index) => {
        const p = (mesh.geometry as THREE.BoxGeometry).parameters;
        size.set(p.width, p.height, p.depth).multiply(mesh.scale);
        matrix.compose(mesh.position, mesh.quaternion, size);
        batch.setMatrixAt(index, matrix);
        this.root.remove(mesh);
        mesh.geometry.dispose();
      });
      batch.computeBoundingSphere();
      this.root.add(batch);
    }
  }
  arch(x: number, z: number, radius: number, height: number) {
    const curve: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI;
      curve.push(
        new THREE.Vector3(
          x + Math.cos(a) * radius,
          height + Math.sin(a) * radius * 0.32,
          z,
        ),
      );
    }
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(curve),
        24,
        0.15,
        6,
        false,
      ),
      material(0xbba27b),
    );
    mesh.castShadow = true;
    this.root.add(mesh);
  }
  sign(
    text: string,
    x: number,
    y: number,
    z: number,
    width: number,
    ground = false,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = ground ? "#c67a49" : "#755540";
    if (!ground) {
      ctx.fillRect(0, 0, 512, 256);
      ctx.strokeStyle = "#cdb68c";
      ctx.lineWidth = 8;
      ctx.strokeRect(10, 10, 492, 236);
      ctx.fillStyle = "#f0ddba";
    }
    ctx.font = "bold 170px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 139, 450);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width / 2),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: ground,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    m.position.set(x, y, z);
    if (ground) m.rotation.x = -Math.PI / 2;
    this.root.add(m);
  }
  palm(x: number, z: number) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.3, 8, 8),
      material(0x8e7a59),
    );
    trunk.position.set(x, 4, z);
    trunk.rotation.z = 0.08;
    trunk.castShadow = true;
    this.root.add(trunk);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, 8, z),
        new THREE.Vector3(x + Math.cos(a) * 1.8, 8.5, z + Math.sin(a) * 1.8),
        new THREE.Vector3(x + Math.cos(a) * 3.5, 7.3, z + Math.sin(a) * 3.5),
      ]);
      const leaf = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 8, 0.18, 4, false),
        material(0x526a47),
      );
      leaf.castShadow = true;
      this.root.add(leaf);
      for (let j = 1; j < 7; j++) {
        const p = curve.getPoint(j / 8);
        const frond = box(this.root, 0.08, 0.04, 1.3, p.x, p.y, p.z, 0x5e744d);
        frond.rotation.y = -a;
        frond.rotation.z = -0.25;
      }
    }
  }
}
