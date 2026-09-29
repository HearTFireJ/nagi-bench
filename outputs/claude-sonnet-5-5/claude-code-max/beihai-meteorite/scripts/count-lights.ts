// 统计每个场景里的灯光数量与投影灯数量（真实 GPU 上着色器的采样器/uniform 上限风险的粗检）。
import "./fakedom";
import * as THREE from "three";
import { buildFilm } from "../src/film/build";

const film = buildFilm();
for (const s of film.worlds) {
  const c: Record<string, number> = {};
  let shadows = 0;
  let meshes = 0;
  let instanced = 0;
  let tris = 0;
  s.traverse((o) => {
    if ((o as THREE.Light).isLight) {
      const l = o as THREE.Light & { castShadow?: boolean };
      c[l.type] = (c[l.type] ?? 0) + 1;
      if (l.castShadow) shadows++;
    }
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      meshes++;
      if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) instanced++;
      const g = m.geometry;
      const n = g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
      tris += n * (((m as unknown as THREE.InstancedMesh).isInstancedMesh ? 1 : 1));
    }
  });
  console.log(s.name || s.uuid.slice(0, 6), JSON.stringify(c), "阴影灯", shadows, "网格", meshes, "实例网格", instanced, "三角形≈", Math.round(tris));
}
