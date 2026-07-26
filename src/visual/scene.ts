import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from 'three'
import type { PerformanceState } from '../types'
import { approach, approachHue, hueForDegree } from './palette'

export type Visualizer = {
  update: (state: PerformanceState, level: number, timeMs: number) => void
  dispose: () => void
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

/**
 * One fullscreen pass, deliberately.
 *
 * MediaPipe wants the same GPU this is drawing on, so the visuals stay a single cheap
 * fragment shader rather than a particle system or a post-processing stack — dropped
 * tracking frames would cost far more than any extra prettiness is worth.
 */
const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform vec2  uResolution;
  uniform float uTime;
  uniform float uLevel;
  uniform float uDistortion;
  uniform float uHue;
  uniform float uMinor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p *= 2.02;
      amplitude *= 0.5;
    }
    return value;
  }

  vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
    float t = uTime * 0.06;

    // Domain warping: the field flows through itself rather than merely scrolling.
    vec2 warp = vec2(fbm(uv * 1.5 + t), fbm(uv * 1.5 + vec2(4.3, 1.9) - t));
    vec2 p = uv + warp * (0.45 + uDistortion * 0.85);

    float field = fbm(p * 2.1 + t * 0.7);

    // Drive tears the field into bands, tighter and harsher the further the wrist leans.
    field += uDistortion * 0.42 * sin((p.y + t * 2.0) * (16.0 + uDistortion * 55.0));

    float vignette = 1.0 - smoothstep(0.15, 1.2, length(uv));
    float glow = vignette * (0.05 + uLevel * 1.5) * (0.35 + field * 0.95);

    // Minor pulls the colour round and cools it off.
    float hue = fract(uHue + uMinor * 0.11 + field * 0.05);
    float saturation = mix(0.8, 0.5, uMinor) * (1.0 - uDistortion * 0.22);

    vec3 colour = hsv2rgb(vec3(hue, saturation, clamp(glow, 0.0, 1.0)));

    // A touch of channel split so heavy drive reads as damage rather than just brightness.
    colour.r *= 1.0 + uDistortion * 0.30;
    colour.b *= 1.0 - uDistortion * 0.18;

    gl_FragColor = vec4(colour, 1.0);
  }
`

export function createVisualizer(canvas: HTMLCanvasElement): Visualizer {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

  const uniforms = {
    uResolution: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uLevel: { value: 0 },
    uDistortion: { value: 0 },
    uHue: { value: hueForDegree(1) },
    uMinor: { value: 0 },
  }

  const scene = new Scene()
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const geometry = new PlaneGeometry(2, 2)
  const material = new ShaderMaterial({ vertexShader, fragmentShader, uniforms })
  scene.add(new Mesh(geometry, material))

  let width = 0
  let height = 0

  function resize(): void {
    width = canvas.clientWidth
    height = canvas.clientHeight
    renderer.setSize(width, height, false)
    uniforms.uResolution.value.set(
      width * renderer.getPixelRatio(),
      height * renderer.getPixelRatio(),
    )
  }

  resize()

  return {
    update(state, level, timeMs) {
      if (canvas.clientWidth !== width || canvas.clientHeight !== height) resize()

      uniforms.uTime.value = timeMs / 1000

      // Everything the shader reads is eased rather than snapped: a chord change should
      // bloom into its new colour, not cut to it.
      const targetHue = state.degree === null ? hueForDegree(1) : hueForDegree(state.degree)
      uniforms.uHue.value = approachHue(uniforms.uHue.value, targetHue, 0.06)
      uniforms.uMinor.value = approach(uniforms.uMinor.value, state.quality === 'minor' ? 1 : 0, 0.05)
      // The left wrist no longer drives an audio effect, but it still warps the field —
      // it is the one control with nothing to hear, so it had better be worth seeing.
      uniforms.uDistortion.value = approach(uniforms.uDistortion.value, state.tilt, 0.12)
      uniforms.uLevel.value = approach(uniforms.uLevel.value, Math.min(level * 1.6, 1), 0.2)

      renderer.render(scene, camera)
    },

    dispose() {
      geometry.dispose()
      material.dispose()
      renderer.dispose()
    },
  }
}
