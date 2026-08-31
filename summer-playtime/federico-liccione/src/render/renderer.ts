/**
 * The WebGL2 layer. Draws a `Mesh` through a projection matrix and does nothing
 * else — no scene logic, no game state, no arithmetic that could be wrong
 * without a test noticing. All of that lives in `geometry.ts` and
 * `projection.ts`, which are pure and tested.
 *
 * No 3D framework. The scene is quads and the projection is sixteen floats, and
 * a framework would hide exactly the part that has to be right.
 */
import type { Point3 } from '../engine'
import type { Mesh } from './geometry'
import { offAxis, symmetric, type Screen } from './projection'

const VERT = `#version 300 es
in vec3 aPos;
in vec3 aColor;
in vec2 aUv;
in float aTextured;
uniform mat4 uMVP;
out vec3 vColor;
out float vDepth;
out vec2 vClip;
out vec2 vUv;
out float vTextured;
void main() {
  vColor = aColor;
  vUv = aUv;
  vTextured = aTextured;
  vDepth = -aPos.z;
  gl_Position = uMVP * vec4(aPos, 1.0);
  vClip = gl_Position.xy / max(gl_Position.w, 0.0001);
}`

const FRAG = `#version 300 es
precision highp float;
in vec3 vColor;
in float vDepth;
in vec2 vClip;
in vec2 vUv;
in float vTextured;
uniform float uFogFar;
uniform vec3 uFog;
uniform float uTime;
uniform float uShake;
uniform float uRain;
uniform vec3 uSkyLow;
uniform vec3 uSkyHigh;
/** Device pixels per CSS pixel, so the rain is the same size on every display. */
uniform float uPxScale;
out vec4 frag;

// Cheap hash for the grain. Deterministic in space, animated by uTime.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

/**
 * The sky: two flat bands with a hard edge between them.
 *
 * It used to be a gradient with drifting fbm cloud and a haze band at the
 * horizon. All three were removed for the same reason: they are *soft*, and
 * everything soft in this picture turned out to be something the eye had to look
 * past to answer the only question the game asks — is that enemy exposed. Clouds
 * are now geometry -- cloudMesh -- flat rectangles like the rest of the world.
 */
vec3 skyAt(vec2 uv) {
  float y = clamp(uv.y, 0.0, 1.0);
  return mix(uSkyLow, uSkyHigh, smoothstep(0.34, 0.42, y));
}

void main() {
  vec3 own = vTextured > 0.5 ? skyAt(vUv) : vColor;

  /**
   * Aerial perspective, kept but turned right down.
   *
   * At 0.72 it was doing the job the checkered floor now does, and doing it by
   * removing contrast from exactly the far half of the room where an enemy is
   * hardest to see. At 0.14 it still separates the far wall from the near cover
   * and no longer decides anything.
   */
  float t = clamp(vDepth / uFogFar, 0.0, 1.0);
  vec3 c = mix(own, uFog, t * 0.14);

  // A trace of vignette. Any more and it competes with the blocks for the
  // player's attention at the edges, which is where the leaning happens.
  float r = length(vClip);
  c *= 1.0 - 0.12 * clamp(r * r * 0.55, 0.0, 1.0);

  /**
   * Rain, in three depths.
   *
   * Screen-space on purpose: weather is between the player and the world rather
   * than in it, and a particle system for something with no gameplay meaning would
   * be a lot of buffers for one mood.
   *
   * The first version was one layer of identical columns, all the same width, all
   * the same period, all falling at nearly the same speed, and it read as exactly
   * what it was — *"non è realistica dato che scorre in colonne tutte uguali a
   * velocità elevata"*. Rain does not look like rain because of the drops. It looks
   * like rain because the drops disagree: near ones are long, fast, bright and
   * sparse, far ones are short, slow, dim and dense, and none of them share a
   * period. So this is three layers that disagree on all five, plus a slant, plus
   * a per-column phase so no two columns start their cycle together.
   *
   * Everything is in CSS pixels rather than device pixels, because otherwise the
   * rain is half the size on a high-DPI screen.
   */
  if (uRain > 0.001) {
    vec2 px = gl_FragCoord.xy / max(uPxScale, 0.5);
    float wet = 0.0;
    for (int i = 0; i < 3; i++) {
      float k = float(i);
      // Near layer first: wide columns, long fast streaks, few of them.
      float colW = 9.0 - 2.5 * k;
      float len = 26.0 - 7.0 * k;
      float speed = 210.0 - 55.0 * k;
      float density = 0.10 + 0.07 * k;
      float bright = 0.55 - 0.15 * k;
      float slant = 0.10 + 0.03 * k;

      // The slant is applied to the sampling grid, so the columns lean rather than
      // the drops being sheared inside upright columns.
      float x = px.x + px.y * slant;
      float col = floor(x / colW) + k * 37.0;
      float phase = hash(vec2(col, 3.0));
      // Per-column speed and period. Two columns of rain that share a period read
      // as a texture; this is most of the difference.
      float sp = speed * (0.80 + 0.45 * phase);
      float period = len * (3.0 + 4.0 * hash(vec2(col, 11.0)));
      float y = px.y + uTime * sp + phase * 997.0;
      float cell = floor(y / period);
      float within = (y / period - cell) * period;
      float on = step(1.0 - density, hash(vec2(col, cell + 0.5)));
      // A streak that fades along its own length, and a drop-by-drop brightness.
      float s = on * clamp(1.0 - within / len, 0.0, 1.0);
      wet += s * s * bright * (0.55 + 0.45 * hash(vec2(col, cell)));
    }
    c += vec3(0.62, 0.70, 0.84) * wet * uRain * 0.30;
  }

  // A red lift while the screen is shaking from a hit. The film grain that used
  // to be here is gone: grain on flat colour is just noise on flat colour.
  c += vec3(0.20, 0.02, 0.03) * uShake;

  frag = vec4(c, 1.0);
}`

export type ProjectionMode = 'window' | 'dolly'

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)
  if (!s) throw new Error('createShader failed')
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) ?? 'shader compile failed')
  }
  return s
}

export class Renderer {
  private readonly gl: WebGL2RenderingContext
  private readonly prog: WebGLProgram
  private readonly vao: WebGLVertexArrayObject
  private readonly posBuf: WebGLBuffer
  private readonly colBuf: WebGLBuffer
  private readonly uvBuf: WebGLBuffer
  private readonly texFlagBuf: WebGLBuffer
  private readonly idxBuf: WebGLBuffer
  /** What distance pulls colour towards. Per-level, from the mood. */
  fog: [number, number, number] = [0.68, 0.80, 0.94]
  /** 0 to 1. Weather is a per-level property. */
  rain = 0
  /** Device pixels per CSS pixel. Set by `resize`; keeps the rain a constant size. */
  private pxScale = 1
  /** The sky's two bands, per level. See `render/mood.ts`. */
  skyLow: [number, number, number] = [0.62, 0.82, 0.97]
  skyHigh: [number, number, number] = [0.29, 0.57, 0.92]
  private indexCount = 0

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false })
    if (!gl) throw new Error('WebGL2 is not available in this browser')
    this.gl = gl

    const prog = gl.createProgram()
    if (!prog) throw new Error('createProgram failed')
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) ?? 'link failed')
    }
    this.prog = prog
    gl.useProgram(prog)

    const vao = gl.createVertexArray()
    const posBuf = gl.createBuffer()
    const colBuf = gl.createBuffer()
    const uvBuf = gl.createBuffer()
    const texFlagBuf = gl.createBuffer()
    const idxBuf = gl.createBuffer()
    if (!vao || !posBuf || !colBuf || !uvBuf || !texFlagBuf || !idxBuf) {
      throw new Error('buffer allocation failed')
    }
    this.vao = vao
    this.posBuf = posBuf
    this.colBuf = colBuf
    this.uvBuf = uvBuf
    this.texFlagBuf = texFlagBuf
    this.idxBuf = idxBuf

    gl.bindVertexArray(vao)
    this.attribute(posBuf, 'aPos', 3)
    this.attribute(colBuf, 'aColor', 3)
    this.attribute(uvBuf, 'aUv', 2)
    this.attribute(texFlagBuf, 'aTextured', 1)

    gl.enable(gl.DEPTH_TEST)
    gl.clearColor(0.01, 0.02, 0.04, 1)
  }

  private attribute(buf: WebGLBuffer, name: string, size: number): void {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    const loc = gl.getAttribLocation(this.prog, name)
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0)
  }

  upload(mesh: Mesh): void {
    const gl = this.gl
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texFlagBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.textured, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.DYNAMIC_DRAW)
    this.indexCount = mesh.indices.length
  }

  /**
   * Resize the drawing buffer and report the screen's physical extent. Height
   * follows the canvas aspect ratio from the calibrated width, so there is one
   * measured number and one derived one rather than two guesses.
   */
  resize(widthCm: number): Screen {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    this.pxScale = dpr
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.gl.viewport(0, 0, w, h)
    return { widthCm, heightCm: (widthCm * h) / w }
  }

  /**
   * Returns the matrix it drew with. Aiming needs to project enemies to the
   * screen, and doing that with a *separately computed* matrix would let the
   * crosshair and the picture disagree by a frame.
   */
  draw(
    eye: Point3,
    screen: Screen,
    mode: ProjectionMode,
    fogFar = 340,
    timeS = 0,
    shake = 0,
  ): Float32Array {
    const gl = this.gl
    const mvp = mode === 'window' ? offAxis(eye, screen) : symmetric(eye, screen)
    gl.useProgram(this.prog)
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, 'uMVP'), false, mvp)
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uFogFar'), fogFar)
    gl.uniform3f(gl.getUniformLocation(this.prog, 'uFog'), ...this.fog)
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uTime'), timeS)
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uShake'), shake)
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uRain'), this.rain)
    gl.uniform3f(gl.getUniformLocation(this.prog, 'uSkyLow'), ...this.skyLow)
    gl.uniform3f(gl.getUniformLocation(this.prog, 'uSkyHigh'), ...this.skyHigh)
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uPxScale'), this.pxScale)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.bindVertexArray(this.vao)
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0)
    return mvp
  }
}
