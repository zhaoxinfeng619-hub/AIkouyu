/*
Fluid Orb — Rare UI, https://rareui.com
Source: https://github.com/swamimalode07/rare-ui/blob/1d572f4b1862f5f6b1be61bb33380fede433e1df/components/ui/fluid-orb.tsx
Adapted for AI口语搭子: shared browser/WeChat lifecycle, rectangular canvas,
audio-driven size/speed, muted color, and reduced-motion controls.
The underlying fluid shader and default blue are from Rare UI.

MIT + Commons Clause License Condition v1.0 + Attribution

Copyright (c) 2026 Swami Malode

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, and distribute the Software as part of an
application, website, or product, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

Attribution Requirement

Any project that ships any part of the Software must credit Rare UI with a
visible link to https://rareui.com, placed where a visitor or user can find it,
such as a site footer, an about page, a credits screen or a README. The credit
and the copyright notice above must not be removed from the source you copied.

Commons Clause Restriction

You may use this Software, including for any commercial purpose, so long as you
do not sell, sublicense, or redistribute the components themselves, whether
alone, in a bundle, or as a ported version.

No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoiceOrb = api.VoiceOrb;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERTEX = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;
  const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_color;
uniform float u_scale;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.6;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / (min(u_resolution.x, u_resolution.y) * u_scale) + 0.5;
  float t = u_time * 0.22;

  vec2 drift = vec2(
    sin(t) + 0.6 * sin(t * 1.7 + 1.3),
    cos(t * 0.8) + 0.6 * cos(t * 1.3 + 2.1)
  );

  vec2 p = vec2(uv.x * 1.8, uv.y * 1.0) + drift * 0.7;

  vec2 q = vec2(fbm(p + drift), fbm(p + vec2(3.2, 1.5) - drift));
  float f = fbm(p + 1.2 * q);

  float g = clamp(1.0 - uv.y, 0.0, 1.0);
  float anchor = smoothstep(0.0, 0.3, uv.y);
  float shade = clamp(g + (f - 0.5) * 0.8 * anchor, 0.0, 1.0);

  vec3 white = vec3(0.99, 1.0, 1.0);
  vec3 light = mix(white, u_color, 0.5);
  vec3 dark = u_color;

  vec3 col = white;
  col = mix(col, light, smoothstep(0.28, 0.52, shade));
  col = mix(col, dark, smoothstep(0.58, 0.88, shade));

  float edge = smoothstep(0.5, 0.49, distance(uv, vec2(0.5)));

  gl_FragColor = vec4(col * edge, edge);
}
`;

  const MODES = {
    idle: { speed: 1, muted: 0 },
    connecting: { speed: 1.3, muted: 0 },
    listening: { speed: 1, muted: 0 },
    thinking: { speed: 1.8, muted: 0 },
    speaking: { speed: 1, muted: 0 },
    muted: { speed: 0.4, muted: 1 },
    ended: { speed: 0.5, muted: 0.25 },
  };
  const clamp = x => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

  class VoiceOrb {
    constructor(canvas, options) {
      if (!canvas || typeof canvas.getContext !== 'function') throw new Error('Canvas is unavailable');
      this.canvas = canvas;
      this.options = options || {};
      this.mode = 'idle';
      this.current = Object.assign({}, MODES.idle);
      this.inputLevel = 0;
      this.outputLevel = 0;
      this.inputAt = 0;
      this.outputAt = 0;
      this.energy = 0;
      this.time = 0;
      this.lastFrame = 0;
      this.running = false;
      this.destroyed = false;
      this.reduced = false;
      this.pixelRatio = Math.min(2, Math.max(1, this.options.pixelRatio || 1));
      const owner = typeof canvas.requestAnimationFrame === 'function' ? canvas : (typeof globalThis !== 'undefined' ? globalThis : {});
      this.requestFrame = owner.requestAnimationFrame ? owner.requestAnimationFrame.bind(owner) : callback => setTimeout(() => callback(Date.now()), 34);
      this.cancelFrame = owner.cancelAnimationFrame ? owner.cancelAnimationFrame.bind(owner) : clearTimeout;
      this._tick = this._tick.bind(this);
      this.gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, depth: false, stencil: false, preserveDrawingBuffer: false });
      if (!this.gl) throw new Error('WebGL is unavailable');
      this._init();
      this.resize(320, 320);
      this._lost = event => {
        if (event.preventDefault) event.preventDefault();
        this.restoreRunning = this.running;
        this.pause();
      };
      this._restored = () => {
        if (this.destroyed) return;
        this._init();
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this._draw();
        if (this.restoreRunning) this.start();
      };
      if (canvas.addEventListener) {
        canvas.addEventListener('webglcontextlost', this._lost);
        canvas.addEventListener('webglcontextrestored', this._restored);
      }
    }
    _init() {
      const gl = this.gl;
      const shaders = [];
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          gl.deleteShader(shader);
          throw new Error('Voice orb shader unavailable');
        }
        shaders.push(shader); return shader;
      };
      this.program = gl.createProgram();
      try {
        gl.attachShader(this.program, compile(gl.VERTEX_SHADER, VERTEX));
        gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error('Voice orb renderer unavailable');
      } catch (error) {
        gl.deleteProgram(this.program); this.program = null; throw error;
      } finally { shaders.forEach(shader => gl.deleteShader(shader)); }
      gl.useProgram(this.program);
      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'a_pos');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.uniforms = {};
      ['resolution','time','color','scale'].forEach(name => { this.uniforms[name] = gl.getUniformLocation(this.program, 'u_' + name); });
    }
    resize(width, height) {
      if (this.destroyed) return;
      const scale = Math.min(this.pixelRatio, 720 / Math.max(width || 320, height || 320));
      this.canvas.width = Math.max(1, Math.round((width || 320) * scale));
      this.canvas.height = Math.max(1, Math.round((height || 320) * scale));
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this._draw();
    }
    setState(mode) {
      if (MODES[mode]) this.mode = mode;
      if (this.reduced) { this.current = Object.assign({}, MODES[this.mode]); this._draw(); }
    }
    setInputLevel(value) { this.inputLevel = clamp(value); this.inputAt = Date.now(); }
    setOutputLevel(value) { this.outputLevel = clamp(value); this.outputAt = Date.now(); }
    setReducedMotion(value) {
      const changed = this.reduced !== Boolean(value);
      this.reduced = Boolean(value);
      if (!changed) return;
      if (this.reduced) {
        if (this.frame !== undefined) this.cancelFrame(this.frame);
        this.frame = undefined;
        this.energy = 0; this._draw();
      } else if (this.running) {
        this.lastFrame = 0;
        this.frame = this.requestFrame(this._tick);
      }
    }
    start() {
      if (this.destroyed || this.running) return;
      this.running = true; this.lastFrame = 0;
      if (this.reduced) this._draw();
      else this.frame = this.requestFrame(this._tick);
    }
    pause() {
      this.running = false;
      if (this.frame !== undefined) this.cancelFrame(this.frame);
      this.frame = undefined;
      this.lastFrame = 0;
      this.inputLevel = this.outputLevel = this.energy = 0;
    }
    _tick(stamp) {
      if (!this.running || this.destroyed) return;
      this.frame = this.requestFrame(this._tick);
      if (this.lastFrame && stamp - this.lastFrame < 1000 / 30) return;
      const dt = this.lastFrame ? Math.min(0.075, Math.max(0, (stamp - this.lastFrame) / 1000)) : 0.034;
      this.lastFrame = stamp;
      if (this.reduced) return;
      const target = MODES[this.mode];
      const blend = 1 - Math.exp(-dt * 3.5);
      Object.keys(target).forEach(key => { this.current[key] += (target[key] - this.current[key]) * blend; });
      const now = Date.now();
      const input = now - this.inputAt < 250 ? this.inputLevel : 0;
      const output = now - this.outputAt < 250 ? this.outputLevel : 0;
      const level = this.mode === 'speaking' ? output : this.mode === 'listening' ? input : 0;
      this.energy += (level - this.energy) * (1 - Math.exp(-dt * (level > this.energy ? 14 : 5)));
      this.time += dt * (this.current.speed + this.energy * 0.7);
      this._draw();
    }
    _draw() {
      if (this.destroyed || !this.program) return;
      const gl = this.gl, u = this.uniforms;
      if (typeof gl.isContextLost === 'function' && gl.isContextLost()) return;
      gl.useProgram(this.program);
      gl.uniform2f(u.resolution, this.canvas.width, this.canvas.height);
      gl.uniform1f(u.time, this.time);
      // Original Rare UI blue (#1A73F2); only muted/ended states desaturate it.
      const muted = this.current.muted * 0.73;
      gl.uniform3f(u.color, 26 / 255 * (1 - muted) + 0.62 * muted, 115 / 255 * (1 - muted) + 0.69 * muted, 242 / 255 * (1 - muted) + 0.79 * muted);
      gl.uniform1f(u.scale, 0.77 + (this.reduced ? 0 : this.energy * 0.06));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    destroy() {
      if (this.destroyed) return;
      this.pause();
      this.destroyed = true;
      if (this.canvas.removeEventListener) {
        this.canvas.removeEventListener('webglcontextlost', this._lost);
        this.canvas.removeEventListener('webglcontextrestored', this._restored);
      }
      if (this.buffer) this.gl.deleteBuffer(this.buffer);
      if (this.program) this.gl.deleteProgram(this.program);
      this.buffer = this.program = null;
    }
  }
  return { VoiceOrb };
});
