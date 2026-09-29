// Checks (with the stub's real vector math) that both hands can reach the weapon for every weapon, in the third-person
// character rig and in the first-person view model. Run: node --experimental-transform-types --import ./scripts/register-stubs.mjs scripts/check-reach.ts
import './stubs/dom.ts';
import { CharacterView } from '../src/render/characterModel.ts';
import { ViewModel } from '../src/render/viewmodel.ts';
import { createActor, makeWeaponState } from '../src/game/actor.ts';
import type { WeaponId } from '../src/game/types.ts';
import type { Actor } from '../src/game/types.ts';

const REACH = 0.32 + 0.3;
const ids: WeaponId[] = ['ak47', 'm4a4', 'awp', 'glock', 'usp', 'deagle', 'knife', 'c4'];

const actorWith = (id: WeaponId): Actor => {
  const a = createActor(0, 'x', 'CT', true);
  if (id === 'ak47' || id === 'm4a4' || id === 'awp') {
    a.weapons.primary = makeWeaponState(id);
    a.activeSlot = 'primary';
  } else if (id === 'knife') {
    a.activeSlot = 'melee';
  } else if (id === 'c4') {
    a.hasBomb = true;
    a.activeSlot = 'bomb';
  } else {
    a.weapons.secondary = makeWeaponState(id);
    a.activeSlot = 'secondary';
  }
  return a;
};

let bad = 0;
const rep = (label: string, d: number): void => {
  const ok = d <= REACH * 1.03;
  if (!ok) bad++;
  console.log((ok ? 'OK  ' : 'FAR ') + label.padEnd(26) + 'distance ' + d.toFixed(3) + ' / reach ' + REACH.toFixed(2));
};

for (const id of ids) {
  const cv = new CharacterView('T') as unknown as Record<string, any>;
  const a = actorWith(id);
  (cv as unknown as CharacterView).update(a, 0, 0, 0, 1, 0.016, false);
  const dist = (shoulder: any, t: any) => Math.hypot(shoulder.position.x - t.x, shoulder.position.y - t.y, shoulder.position.z - t.z);
  rep('third-person R hand ' + id, dist(cv.armR.shoulder, cv.targetR));
  rep('third-person L hand ' + id, dist(cv.armL.shoulder, cv.targetL));

  const vm = new ViewModel() as unknown as Record<string, any>;
  (vm as unknown as ViewModel).update(a, 1, 0.016, true);
  rep('first-person R hand ' + id, dist(vm.armR.shoulder, vm.targetR));
  rep('first-person L hand ' + id, dist(vm.armL.shoulder, vm.targetL));
}
console.log(bad === 0 ? 'all hands reach their targets' : bad + ' hand targets are out of reach');
process.exit(bad === 0 ? 0 : 1);
