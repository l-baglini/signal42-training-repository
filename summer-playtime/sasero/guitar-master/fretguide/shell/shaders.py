"""GLSL for the video surface. Plain strings, no imports, so tests can read the constants.

The video is uploaded as three single-channel textures -- Y at full resolution, U and V at
half -- and converted to RGB here, on the GPU, as part of a blit it is doing anyway. That
is the whole reason the picture can be colour at no CPU cost: capture.py already receives
these planes and was throwing two of them away (docs/PLAN-shell.md section 1.1).

Sampling U and V with linear filtering at half resolution gives the chroma upsampling for
free, which is also what every video decoder does.
"""

from __future__ import annotations

#: BT.601 limited range, the coefficients V4L2 delivers for this capture format. If the
#: picture is ever washed out or over-saturated, suspect this first: full-range BT.601 and
#: BT.709 are both plausible-looking and both wrong here. tools/probe_gl.py checks the
#: round-trip against these exact numbers.
BT601_LIMITED = {
    "y_offset": 0.0625,  # 16/255
    "y_scale": 1.164383,
    "r_v": 1.596027,
    "g_v": -0.812968,
    "g_u": -0.391762,
    "b_u": 2.017232,
}

VERTEX = """
#version 330 core
const vec2 QUAD[4] = vec2[4](vec2(-1,-1), vec2(1,-1), vec2(-1,1), vec2(1,1));
uniform bool mirror;
out vec2 uv;
void main() {
    vec2 p = QUAD[gl_VertexID];
    // Texture origin is bottom-left, image origin is top-left: flip v, not the geometry,
    // so the letterbox viewport stays in widget coordinates.
    uv = vec2(mirror ? 0.5 - p.x * 0.5 : p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
    gl_Position = vec4(p, 0.0, 1.0);
}
"""

FRAGMENT = """
#version 330 core
in vec2 uv;
out vec4 frag;
uniform sampler2D texY;
uniform sampler2D texU;
uniform sampler2D texV;
uniform float dim;   // 1.0 normally; lowered when the pose was refused
void main() {
    float y = texture(texY, uv).r;
    float u = texture(texU, uv).r - 0.5;
    float v = texture(texV, uv).r - 0.5;
    y = 1.164383 * (y - 0.0625);
    vec3 rgb = vec3(
        y + 1.596027 * v,
        y - 0.812968 * v - 0.391762 * u,
        y + 2.017232 * u);
    frag = vec4(clamp(rgb, 0.0, 1.0) * dim, 1.0);
}
"""

#: A greyscale frame is drawn by the same shader with both chroma planes held at neutral,
#: so there is no second code path and no branch: 128/255 - 0.5 leaves a residual of
#: 0.002, which is under a level of colour after the matrix.
NEUTRAL_CHROMA = 128
