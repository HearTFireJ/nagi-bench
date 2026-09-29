/**
 * 仅供无头自检：一个“什么都成功、什么都不画”的 WebGL2 上下文。
 * 目的不是出图，而是让**真实的 three.js WebGLRenderer**（以及构建后的生产包）在 Bun 里跑一遍我们的场景图：
 * 遍历、视锥剔除、排序、阴影通道、材质/程序装配、uniform 上传……任何由我们的场景/材质设置引起的 JS 异常都会暴露。
 * 它验证不了着色器能否在真实 GPU 上编译，也验证不了画面。
 */
const ids = new Map<string, number>();
const names = new Map<number, string>();
const cid = (n: string): number => {
  let v = ids.get(n);
  if (v === undefined) {
    v = 0x4000 + ids.size * 4;
    ids.set(n, v);
    names.set(v, n);
  }
  return v;
};

const PARAMS: Record<string, number | number[] | string> = {
  MAX_TEXTURE_SIZE: 16384,
  MAX_CUBE_MAP_TEXTURE_SIZE: 16384,
  MAX_3D_TEXTURE_SIZE: 2048,
  MAX_ARRAY_TEXTURE_LAYERS: 2048,
  MAX_TEXTURE_IMAGE_UNITS: 16,
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16,
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: 32,
  MAX_VERTEX_ATTRIBS: 16,
  MAX_VERTEX_UNIFORM_VECTORS: 1024,
  MAX_VARYING_VECTORS: 30,
  MAX_FRAGMENT_UNIFORM_VECTORS: 1024,
  MAX_SAMPLES: 4,
  MAX_RENDERBUFFER_SIZE: 16384,
  MAX_DRAW_BUFFERS: 8,
  MAX_COLOR_ATTACHMENTS: 8,
  MAX_UNIFORM_BUFFER_BINDINGS: 24,
  MAX_UNIFORM_BLOCK_SIZE: 65536,
  MAX_VERTEX_UNIFORM_BLOCKS: 12,
  MAX_FRAGMENT_UNIFORM_BLOCKS: 12,
  MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS: 4,
  MAX_ELEMENT_INDEX: 4294967295,
  VERSION: "WebGL 2.0 (fake)",
  SHADING_LANGUAGE_VERSION: "WebGL GLSL ES 3.00 (fake)",
  VENDOR: "fake",
  RENDERER: "fake",
  ALIASED_LINE_WIDTH_RANGE: [1, 1],
  ALIASED_POINT_SIZE_RANGE: [1, 1024],
  MAX_VIEWPORT_DIMS: [16384, 16384],
  VIEWPORT: [0, 0, 1920, 817],
  SCISSOR_BOX: [0, 0, 1920, 817],
  COLOR_WRITEMASK: [1, 1, 1, 1] as unknown as number[],
};

/** 记录绘制/程序相关调用的次数，证明 three 真的跑了渲染路径 */
export const glStats: Record<string, number> = {};

export function makeFakeGL(canvas: unknown): unknown {
  const target: Record<string | symbol, unknown> = {
    canvas,
    drawingBufferWidth: 1920,
    drawingBufferHeight: 817,
    getParameter(p: number): unknown {
      const n = names.get(p);
      if (n && n in PARAMS) {
        const v = PARAMS[n];
        return Array.isArray(v) ? new Int32Array(v) : v;
      }
      return 0;
    },
    getContextAttributes: () => ({ alpha: true, antialias: true, depth: true, stencil: true, premultipliedAlpha: true, preserveDrawingBuffer: true }),
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
    getExtension: (n: string) => (n === "WEBGL_debug_renderer_info" ? { UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 } : {}),
    getSupportedExtensions: () => [],
    getShaderParameter: () => true,
    getProgramParameter: (_p: unknown, pname: number) => {
      const n = names.get(pname);
      if (n === "LINK_STATUS") return true;
      return 0;
    },
    getShaderInfoLog: () => "",
    getProgramInfoLog: () => "",
    getShaderSource: () => "",
    getError: () => 0,
    checkFramebufferStatus: () => cid("FRAMEBUFFER_COMPLETE"),
    isContextLost: () => false,
    getAttribLocation: () => 0,
    getUniformLocation: () => ({}),
    getUniformBlockIndex: () => 0,
    getActiveUniform: () => null,
    getActiveAttrib: () => null,
    getTexParameter: () => 0,
    getInternalformatParameter: () => new Int32Array([4]),
    fenceSync: () => ({}),
    clientWaitSync: () => cid("ALREADY_SIGNALED"),
    createShader: () => ({}),
    createProgram: () => ({}),
    createBuffer: () => ({}),
    createTexture: () => ({}),
    createFramebuffer: () => ({}),
    createRenderbuffer: () => ({}),
    createVertexArray: () => ({}),
    createQuery: () => ({}),
    createSampler: () => ({}),
    createTransformFeedback: () => ({}),
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop !== "string") return undefined;
      // 大写标识 = 常量；其余 = 什么也不做的函数
      if (/^[A-Z][A-Z0-9_]+$/.test(prop)) return cid(prop);
      if (prop.startsWith("draw") || prop === "useProgram" || prop === "compileShader" || prop === "linkProgram") {
        return () => {
          glStats[prop] = (glStats[prop] ?? 0) + 1;
        };
      }
      return () => undefined;
    },
    set(t, prop, v) {
      t[prop] = v;
      return true;
    },
  });
}
