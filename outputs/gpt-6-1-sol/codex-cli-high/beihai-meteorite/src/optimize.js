import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// Merge only authored static architectural boxes; rigs and animated props remain intact.
export function mergeArchitecture(world){
 const dynamic=new Set();
 for(const value of Object.values(world)){
  if(value?.isMesh)dynamic.add(value);
  if(Array.isArray(value))for(const item of value)if(item?.isMesh)dynamic.add(item);
 }
 const batches=new Map();
 for(const mesh of [...world.g.children]){
  if(!mesh.isMesh||dynamic.has(mesh)||mesh.geometry.type!=='BoxGeometry'||!mesh.material.isMeshStandardMaterial||mesh.material.transparent||mesh.material.map)continue;
  mesh.updateMatrix();let geom=mesh.geometry.clone().toNonIndexed();geom.applyMatrix4(mesh.matrix);geom.deleteAttribute('uv');const count=geom.attributes.position.count,colors=new Float32Array(count*3),c=mesh.material.color;for(let i=0;i<count;i++){colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b}geom.setAttribute('color',new T.BufferAttribute(colors,3));let key=mesh.material.metalness>.3?'metal':'matte';if(!batches.has(key))batches.set(key,[]);batches.get(key).push(geom);world.g.remove(mesh);
 }
 for(let [key,list]of batches){let geometry=mergeGeometries(list);const m=new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,metalness:key==='metal'?.5:0,roughness:key==='metal'?.5:.9}));m.castShadow=true;m.receiveShadow=true;world.g.add(m);list.forEach(g=>g.dispose())}
}
