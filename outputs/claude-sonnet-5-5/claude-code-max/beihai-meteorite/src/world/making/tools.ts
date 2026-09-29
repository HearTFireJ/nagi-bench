// 制作段的手持工具：钳子、胶管、镊子、弹匣、刀、装碎屑的手掌。都朝 +Z 握持。
import * as THREE from "three";
import { voxelMaterial } from "@agentbench/voxel-kit";
import { Vox, noisy } from "../../util/vox";
import { textTexture } from "../../util/pixelfont";
import { shade } from "../../util/color";
import { hash3 } from "../../util/math";

export function pliersMesh(): THREE.Group {
  const g = new THREE.Group();
  const v = new Vox([-0.05, -0.03, -0.14], [0.05, 0.03, 0.14], 0.008);
  // 两片钳身，交叉铰接；钳口朝 +Z
  v.box(-0.03, -0.006, 0.0, -0.005, 0.006, 0.13, noisy(0x9aa0a8, 0.06, 1));
  v.box(0.005, -0.006, 0.0, 0.03, 0.006, 0.13, noisy(0x9aa0a8, 0.06, 2));
  v.box(-0.03, -0.006, -0.13, -0.01, 0.006, 0.0, noisy(0xb0392b, 0.08, 3)); // 红色手柄
  v.box(0.01, -0.006, -0.13, 0.03, 0.006, 0.0, noisy(0xb0392b, 0.08, 4));
  v.cylY(0, 0, 0.012, -0.01, 0.01, 0x3a3f46);
  const m = new THREE.Mesh(v.toGeometry(), voxelMaterial({ roughness: 0.45 }));
  m.castShadow = true;
  g.add(m);
  return g;
}

export function glueTubeMesh(): THREE.Group {
  const g = new THREE.Group();
  const v = new Vox([-0.03, -0.03, -0.09], [0.03, 0.03, 0.09], 0.005);
  v.cylZ(0, 0, 0.026, -0.08, 0.06, noisy(0xe8e6e0, 0.05, 1));
  v.cylZ(0, 0, 0.026, -0.09, -0.08, 0x9aa0a8); // 卷边
  v.cylZ(0, 0, 0.012, 0.06, 0.09, noisy(0x2a2d33, 0.06, 2)); // 嘴
  const m = new THREE.Mesh(v.toGeometry(), voxelMaterial());
  m.castShadow = true;
  g.add(m);
  // 标签（像素字）
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.1, 0.04),
    new THREE.MeshBasicMaterial({ map: textTexture("HULL SEAL", [30, 60, 140]), transparent: true, color: new THREE.Color(1, 1, 1), fog: false }),
  );
  label.position.set(0, 0.027, -0.01);
  label.rotation.x = -Math.PI / 2;
  g.add(label);
  return g;
}

export function tweezersMesh(): THREE.Group {
  const g = new THREE.Group();
  const v = new Vox([-0.02, -0.01, -0.09], [0.02, 0.01, 0.09], 0.004);
  v.box(-0.012, -0.003, -0.08, -0.004, 0.003, 0.09, noisy(0xc0c5cb, 0.05, 1));
  v.box(0.004, -0.003, -0.08, 0.012, 0.003, 0.09, noisy(0xc0c5cb, 0.05, 2));
  v.box(-0.012, -0.003, -0.08, 0.012, 0.003, -0.07, 0xc0c5cb);
  g.add(new THREE.Mesh(v.toGeometry(), voxelMaterial({ roughness: 0.35 })));
  return g;
}

export function magazineMesh(): THREE.Group {
  const g = new THREE.Group();
  const v = new Vox([-0.02, -0.07, -0.05], [0.02, 0.07, 0.05], 0.005);
  v.box(-0.018, -0.07, -0.045, 0.018, 0.07, 0.045, noisy(0x23262b, 0.06, 1));
  v.box(-0.019, -0.075, -0.048, 0.019, -0.065, 0.048, 0x50565f);
  v.box(-0.004, -0.06, 0.044, 0.004, 0.06, 0.05, 0x777d86);
  g.add(new THREE.Mesh(v.toGeometry(), voxelMaterial()));
  return g;
}

export function knifeMesh(): THREE.Group {
  const g = new THREE.Group();
  const v = new Vox([-0.01, -0.02, -0.14], [0.01, 0.02, 0.14], 0.005);
  v.box(-0.006, -0.02, -0.14, 0.006, 0.02, -0.04, noisy(0x2a2d33, 0.06, 1)); // 柄
  v.box(-0.002, -0.018, -0.04, 0.002, 0.018, 0.13, noisy(0xcfd4da, 0.05, 2)); // 刃
  v.box(-0.002, -0.018, 0.12, 0.002, 0.0, 0.14, 0xeaeef2);
  g.add(new THREE.Mesh(v.toGeometry(), voxelMaterial({ roughness: 0.3 })));
  return g;
}

export { shade, hash3 };
