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
   * Rain, as columns of falling streaks. Screen-space on purpose: weather is
   * between the player and the world rather than in it, and a particle system for
   * something with no gameplay meaning would be a lot of buffers for one mood.
   */
  if (uRain > 0.001) {
    float col = floor(gl_FragCoord.x / 3.0);
    float speed = 300.0 + hash(vec2(col, 1.0)) * 260.0;
    float yy = gl_FragCoord.y + uTime * speed;
    float cell = floor(yy / 30.0);
    float f = fract(yy / 30.0);
    float on = step(0.93, hash(vec2(col, cell)));
    float streak = on * smoothstep(0.0, 0.22, f) * (1.0 - smoothstep(0.22, 1.0, f));
    c += vec3(0.58, 0.66, 0.80) * streak * uRain * 0.32;
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
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.bindVertexArray(this.vao)
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0)
    return mvp
  }
}
