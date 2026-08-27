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
uniform mat4 uMVP;
out vec3 vColor;
out float vDepth;
void main() {
  vColor = aColor;
  vDepth = -aPos.z;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
in vec3 vColor;
in float vDepth;
uniform float uFogFar;
uniform vec3 uFog;
out vec4 frag;
void main() {
  // Aerial perspective. A monocular depth cue that works on a flat panel, and
  // the only place in the renderer where anything is added for the look of it.
  float t = clamp(vDepth / uFogFar, 0.0, 1.0);
  frag = vec4(mix(vColor, uFog, t * 0.72), 1.0);
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
  private readonly idxBuf: WebGLBuffer
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
    const idxBuf = gl.createBuffer()
    if (!vao || !posBuf || !colBuf || !idxBuf) throw new Error('buffer allocation failed')
    this.vao = vao
    this.posBuf = posBuf
    this.colBuf = colBuf
    this.idxBuf = idxBuf

    gl.bindVertexArray(vao)
    this.attribute(posBuf, 'aPos', 3)
    this.attribute(colBuf, 'aColor', 3)

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

  draw(eye: Point3, screen: Screen, mode: ProjectionMode, fogFar = 340): void {
    const gl = this.gl
    const mvp = mode === 'window' ? offAxis(eye, screen) : symmetric(eye, screen)
    gl.useProgram(this.prog)
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, 'uMVP'), false, mvp)
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uFogFar'), fogFar)
    gl.uniform3f(gl.getUniformLocation(this.prog, 'uFog'), 0.02, 0.03, 0.06)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.bindVertexArray(this.vao)
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0)
  }
}
