import test from "node:test";
import assert from "node:assert/strict";
import {
  groundHeight,
  ROOMS,
  SOLIDS,
  clearPosition,
  moveWithCollision,
  raySolid,
  siteAt,
} from "../src/game/map.ts";
import { Navigation } from "../src/game/navigation.ts";
import { calculateDamage, WEAPONS } from "../src/game/weapons.ts";

test("every classic region connects to both spawns and both bombsites", () => {
  const nav = new Navigation();
  for (const r of ROOMS) {
    for (const goal of [
      { x: 0, z: 30 },
      { x: 0, z: -23 },
      { x: 25, z: -16 },
      { x: -24, z: -14 },
    ]) {
      const path = nav.find({ x: r.x, z: r.z }, goal);
      assert.ok(
        path.length || (r.x === goal.x && r.z === goal.z),
        `${r.name} cannot reach ${JSON.stringify(goal)}`,
      );
      for (const p of path)
        assert.ok(clearPosition(p.x, p.z, 0.48), "path cannot enter collider");
    }
  }
});
test("mid doors have a walkable gap, solid leaves, and block bullets", () => {
  assert.ok(clearPosition(0, -5));
  assert.ok(!clearPosition(-2.3, -5.7));
  const player = { x: 0, y: 0, z: 0 };
  moveWithCollision(player, 0, -10);
  assert.ok(player.z < -9.9);
  const blocked = { x: -2.3, y: 0, z: -1 };
  moveWithCollision(blocked, 0, -10);
  assert.ok(blocked.z > -4.1);
  assert.ok(
    raySolid({ x: -2.3, y: 1.5, z: -1 }, { x: 0, y: 0, z: -1 }, 10) < 5,
  );
});
test("continuous collision cannot tunnel through walls or crates", () => {
  const p = { x: 29, y: 0, z: 5 };
  moveWithCollision(p, 100, 0);
  assert.ok(p.x < 33.2);
  assert.ok(clearPosition(p.x, p.z));
  for (const s of SOLIDS.filter((s) => s.kind === "crate"))
    assert.ok(!clearPosition(s.x, s.z));
});
test("LOS is blocked by cover and clear inside an unobstructed room", () => {
  assert.ok(raySolid({ x: 21, y: 1.5, z: -12 }, { x: 0, y: 0, z: -1 }, 12) < 6);
  assert.equal(raySolid({ x: 0, y: 1.5, z: 28 }, { x: 0, y: 0, z: 1 }, 3), 3);
});
test("headshots double chest damage and armor absorbs finite damage", () => {
  for (const id of Object.keys(WEAPONS) as (keyof typeof WEAPONS)[]) {
    const chest = calculateDamage(id, "chest", 0),
      head = calculateDamage(id, "head", 0);
    assert.equal(head.health, chest.health * 2);
    assert.ok(calculateDamage(id, "chest", 100).health <= chest.health);
    assert.ok(calculateDamage(id, "chest", 3).armor <= 3);
  }
  assert.ok(calculateDamage("awp", "chest", 100).health >= 100);
  assert.ok(WEAPONS.deagle.damage > WEAPONS.usp.damage);
  assert.ok(WEAPONS.deagle.damage < WEAPONS.m4.damage);
  assert.ok(WEAPONS.ak.recoil > WEAPONS.m4.recoil);
  assert.ok(WEAPONS.m4.interval < WEAPONS.ak.interval);
});
test("plant zones correspond to A and B, never mid or spawns", () => {
  assert.equal(siteAt(24, -17), "A");
  assert.equal(siteAt(-24, -15), "B");
  assert.equal(siteAt(0, 30), null);
  assert.equal(siteAt(0, -5), null);
});

test("raised A and catwalk connect through continuous ramps", () => {
  assert.equal(groundHeight(24, -17), 1.2);
  assert.equal(groundHeight(10, -8), 1.2);
  assert.equal(groundHeight(29, -3), 0);
  assert.equal(groundHeight(6.5, -21), 0);
  for (let z = -9; z < -3; z += 0.1)
    assert.ok(Math.abs(groundHeight(29, z) - groundHeight(29, z + 0.1)) < 0.03);
  for (let x = 6.5; x < 14.5; x += 0.1)
    assert.ok(
      Math.abs(groundHeight(x, -21) - groundHeight(x + 0.1, -21)) < 0.03,
    );
});
