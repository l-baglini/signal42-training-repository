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
uniform sampler2D uRoom;
uniform float uHasRoom;
uniform float uRoomLevel;
out vec4 frag;

// Cheap hash for the grain. Deterministic in space, animated by uTime.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec3 own = vColor;
  if (vTextured > 0.5 && uHasRoom > 0.5) {
    /**
     * The room's own pixels, posterised into the game's palette.
     *
     * A photograph used as-is loses twice: at full brightness it competes with
     * everything drawn over it, and crushed to grey it just looks like a bad
     * photograph. Quantising the luminance into a few steps and mapping those
     * through a two-colour ramp keeps the room's structure — which is the part
     * that makes it recognisable — while reading as art rather than as a frame
     * grab. A trace of the original hue survives so a red chair stays reddish.
     */
    vec3 tex = texture(uRoom, vUv).rgb;
    float lum = dot(tex, vec3(0.2126, 0.7152, 0.0722));
    float steps = 5.0;
    float q = floor(lum * steps + 0.5) / steps;
    vec3 dark = vec3(0.055, 0.075, 0.125);
    vec3 light = vec3(0.42, 0.52, 0.62);
    vec3 ramp = mix(dark, light, pow(q, 0.85));
    vec3 hue = tex - vec3(lum);
    own = clamp(ramp + hue * 0.35, 0.0, 1.0) * uRoomLevel;
  }

  // Aerial perspective: a monocular depth cue that works on a flat panel.
  float t = clamp(vDepth / uFogFar, 0.0, 1.0);
  vec3 c = mix(own, uFog, t * 0.72);

  // Vignette. Darkening the edges pushes the eye to the middle, which is where
  // the window is, and costs one dot product.
  float r = length(vClip);
  c *= 1.0 - 0.42 * clamp(r * r * 0.55, 0.0, 1.0);

  // Grain, and a red lift while the screen is shaking from a hit.
  float g = hash(gl_FragCoord.xy + vec2(uTime * 37.0, uTime * 17.0));
  c += (g - 0.5) * 0.028;
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
  private roomTex: WebGLTexture | null = null
  /** How strongly the room's own pixels show. 0 turns the photograph off. */
  roomLevel = 1
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
   * Hand over the frame the room was measured from, to be drawn on the furniture.
   * Called once per scan; the texture is kept until the next one.
   */
  setRoomTexture(source: TexImageSource | null): void {
    const gl = this.gl
    if (!source) {
      this.roomTex = null
      return
    }
    if (!this.roomTex) {
      const tex = gl.createTexture()
      if (!tex) return
      this.roomTex = tex
    }
    gl.bindTexture(gl.TEXTURE_2D, this.roomTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
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
    gl.uniform3f(gl.getUniformLocation(this.prog, 'uFog'), 0.02, 0.03, 0.06)
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uTime'), timeS)
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uShake'), shake)
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uHasRoom'), this.roomTex ? 1 : 0)
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uRoomLevel'), this.roomLevel)
    gl.uniform1i(gl.getUniformLocation(this.prog, 'uRoom'), 0)
    if (this.roomTex) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.roomTex)
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.bindVertexArray(this.vao)
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0)
    return mvp
  }
}
