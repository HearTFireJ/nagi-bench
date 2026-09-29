const d2r = Math.PI / 180;
type V = [number, number, number];
const dir = (az: number, el: number): V => [Math.sin(az * d2r) * Math.cos(el * d2r), Math.sin(el * d2r), -Math.cos(az * d2r) * Math.cos(el * d2r)];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const azc = Number(process.argv[2] ?? -48);
const elc = Number(process.argv[3] ?? -50);
const Dc = Number(process.argv[4] ?? 560);
const R = Number(process.argv[5] ?? 496);
const rho = Math.asin(R / Dc) / d2r;
const c = dir(azc, elc);
console.log("rho", rho.toFixed(1));
for (const az of [-90, -70, -50, -30, -10, 0, 10, 30, 60]) {
  let found = NaN;
  for (let el = elc; el <= 60; el += 0.05) {
    const a = Math.acos(Math.min(1, dot(dir(az, el), c))) / d2r;
    if (a >= rho) {
      found = el;
      break;
    }
  }
  console.log("az", az, "limb el", found.toFixed(1));
}
