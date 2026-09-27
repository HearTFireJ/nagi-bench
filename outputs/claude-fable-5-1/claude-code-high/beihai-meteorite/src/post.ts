import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * The grade: bloom for lamps, sun and muzzle flashes; then a final pass with
 * vignette, film grain, a white flash and a fade-to-black, all driven per frame.
 */
export interface Grade {
  fade: number;      // 0 = clear, 1 = black
  flash: number;     // 0..1 white
  vignette: number;  // 0..1
  grain: number;     // 0..1
  time: number;
  warm: number;      // -1 cool .. +1 warm tint
}

const gradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uFade: { value: 0 },
    uFlash: { value: 0 },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.06 },
    uTime: { value: 0 },
    uWarm: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uFade, uFlash, uVignette, uGrain, uTime, uWarm;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 7.0) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = 1.0 - smoothstep(0.35, 1.05, length(d) * 1.6) * uVignette;
      c.rgb *= v;
      c.rgb += (hash(vUv * 1000.0) - 0.5) * uGrain * (0.3 + 0.7 * (1.0 - clamp(c.g, 0.0, 1.0)));
      c.rgb = mix(c.rgb, c.rgb * vec3(1.0 + 0.10 * uWarm, 1.0, 1.0 - 0.14 * uWarm), 1.0);
      c.rgb = mix(c.rgb, vec3(1.0), uFlash);
      c.rgb = mix(c.rgb, vec3(0.0), uFade);
      gl_FragColor = c;
    }
  `,
};

export interface PostStack {
  /** Renderer-like facade for ThreeStage. */
  facade: {
    domElement: HTMLCanvasElement;
    setSize: (w: number, h: number, updateStyle?: boolean) => void;
    setPixelRatio: (r: number) => void;
    render: (scene: unknown, camera: unknown) => void;
    dispose: () => void;
  };
  grade: Grade;
  bloom: UnrealBloomPass;
  size: { w: number; h: number; ratio: number };
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: () => THREE.PerspectiveCamera): PostStack {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera());
  const bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.55, 0.5, 0.82);
  const gradePass = new ShaderPass(gradeShader);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(gradePass);
  composer.addPass(output);

  const grade: Grade = { fade: 0, flash: 0, vignette: 0.55, grain: 0.05, time: 0, warm: 0 };
  const size = { w: 1, h: 1, ratio: 1 };

  return {
    facade: {
      domElement: renderer.domElement,
      setSize(w, h, updateStyle) {
        renderer.setSize(w, h, updateStyle);
        composer.setSize(w, h);
        size.w = w; size.h = h;
      },
      setPixelRatio(r) {
        renderer.setPixelRatio(r);
        composer.setPixelRatio(r);
        size.ratio = r;
      },
      render() {
        renderPass.camera = camera();
        const u = gradePass.uniforms;
        u.uFade!.value = grade.fade;
        u.uFlash!.value = grade.flash;
        u.uVignette!.value = grade.vignette;
        u.uGrain!.value = grade.grain;
        u.uTime!.value = grade.time;
        u.uWarm!.value = grade.warm;
        composer.render();
      },
      dispose() {
        composer.dispose();
        renderer.dispose();
      },
    },
    grade,
    bloom,
    size,
  };
}
