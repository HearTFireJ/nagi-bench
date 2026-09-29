// 手持小物件：放大镜、茶杯、茶壶（手中版）、手机（带二维码屏幕）、布包。
import * as THREE from "three";
import { voxelMaterial } from "@agentbench/voxel-kit";
import { Vox, noisy } from "../../util/vox";
import { hash2, hash3 } from "../../util/math";
import { shade } from "../../util/color";

/** 放大镜：圆环镜框 + 手柄，沿 +Z 握持（柄朝 -Z，镜面朝 +Z 上方） */
export function loupeMesh(): THREE.Mesh {
  const g = new Vox([-0.09, -0.09, -0.1], [0.09, 0.09, 0.2], 0.008);
  g.cylZ(0, 0, 0.012, -0.1, 0.02, 0x3a2a1a); // 柄
  g.line(0, 0, 0.0, 0, 0.0, 0.05, 0.012, 0x3a2a1a);
  // 镜框（环）+ 镜片（半透明淡蓝，用不透明浅色像素模拟）
  g.cylZ(0, 0, 0.075, 0.05, 0.062, 0x9a7a30, 0.06);
  g.cylZ(0, 0, 0.06, 0.052, 0.056, (x, y) => (Math.abs(x + y) < 0.012 ? 0xffffff : 0xbfe6ff));
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial({ roughness: 0.4 }));
  m.castShadow = true;
  return m;
}

export function cupMesh(): THREE.Mesh {
  const g = new Vox([-0.04, 0, -0.04], [0.04, 0.05, 0.04], 0.006);
  g.cylY(0, 0, 0.038, 0, 0.05, noisy(0xe6e2d6, 0.05, 4), 0.03);
  g.cylY(0, 0, 0.032, 0, 0.008, 0xe6e2d6);
  g.cylY(0, 0, 0.03, 0.036, 0.04, 0xa8541c); // 茶汤
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.castShadow = true;
  return m;
}

export function teapotMesh(): THREE.Mesh {
  const pot = new Vox([-0.12, 0, -0.1], [0.14, 0.14, 0.1], 0.008);
  pot.ellipsoid(0, 0.06, 0, 0.075, 0.055, 0.075, noisy(0x6d3a2a, 0.08, 2));
  pot.cylY(0, 0, 0.03, 0.105, 0.125, 0x5a2f22);
  pot.line(0.06, 0.07, 0, 0.12, 0.11, 0, 0.008, 0x6d3a2a);
  pot.line(-0.06, 0.05, 0, -0.11, 0.09, 0, 0.008, 0x6d3a2a);
  const m = new THREE.Mesh(pot.toGeometry(), voxelMaterial());
  m.castShadow = true;
  return m;
}

/** 手机：黑色薄板 + 发光屏幕（二维码图案） */
export function phoneMesh(): THREE.Group {
  const g = new THREE.Group();
  const body = new Vox([-0.04, -0.075, -0.005], [0.04, 0.075, 0.005], 0.005);
  body.box(-0.04, -0.075, -0.005, 0.04, 0.075, 0.005, 0x15161a);
  g.add(new THREE.Mesh(body.toGeometry(), voxelMaterial()));
  // 屏幕：21×21 伪二维码
  const N = 21;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let on = hash2(x * 7 + 3, y * 11 + 5) > 0.5;
      // 三个定位角
      const corner = (cx: number, cy: number) => {
        const dx = x - cx, dy = y - cy;
        if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null;
        return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
      };
      const c1 = corner(0, 0), c2 = corner(N - 7, 0), c3 = corner(0, N - 7);
      if (c1 !== null) on = c1; else if (c2 !== null) on = c2; else if (c3 !== null) on = c3;
      const v = on ? 20 : 240;
      const i = (y * N + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.07, 0.07),
    new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.4, 1.4, 1.5), fog: false }),
  );
  screen.position.set(0, 0.0, 0.0056);
  g.add(screen);
  const bar = new THREE.Mesh(
    new THREE.PlaneGeometry(0.07, 0.014),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.4, 0.6), fog: false }),
  );
  bar.position.set(0, 0.056, 0.0057);
  g.add(bar);
  return g;
}

/** 布包：深色帆布袋，里面鼓鼓的三块石头 */
export function bundleMesh(): THREE.Mesh {
  const g = new Vox([-0.16, 0, -0.12], [0.16, 0.26, 0.12], 0.012);
  g.ellipsoid(0, 0.12, 0, 0.14, 0.11, 0.1, (x, y, z, i, j, k) => shade(0x2b3a33, 0.85 + hash3(i, j, k) * 0.3));
  g.ellipsoid(-0.05, 0.09, 0.02, 0.06, 0.06, 0.06, (x, y, z, i, j, k) => shade(0x3a463f, 0.9 + hash3(i, j, k) * 0.2));
  g.box(-0.05, 0.19, -0.03, 0.05, 0.27, 0.03, 0x1f2a24); // 扎口
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.castShadow = true;
  return m;
}
