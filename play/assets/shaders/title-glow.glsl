precision mediump float;

uniform float time;
uniform float phaseSeed;
uniform float xOffset;
uniform float progress;
uniform float densityBoost;
uniform float dimStrength;
varying vec2 outTexCoord;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float total = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    total += amp * noise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return total;
}

void main(void) {
  vec2 uv = outTexCoord;
  vec2 p = (uv + vec2(xOffset, 0.0)) * 3.0 + vec2(phaseSeed);
  float t = (time + phaseSeed) * 0.18;
  float n = fbm(p + vec2(t, -t * 0.7));
  float m = fbm(p * 1.6 - vec2(t * 0.4, t * 0.6));
  float blend = smoothstep(0.2, 0.8, n * 0.7 + m * 0.3);
  float vignette = smoothstep(0.9, 0.2, distance(uv, vec2(0.5)));
  vec3 deep = vec3(0.02, 0.18, 0.06);
  vec3 mid = vec3(0.08, 0.45, 0.18);
  vec3 core = vec3(0.16, 0.82, 0.28);
  vec3 glow = vec3(0.55, 1.0, 0.62);
  vec3 color = mix(deep, mid, smoothstep(0.05, 0.35, blend));
  color = mix(color, core, smoothstep(0.3, 0.7, blend));
  color = mix(color, glow, smoothstep(0.65, 0.95, blend));
  float transitionAmount = max(progress, max(densityBoost, dimStrength));
  float sweepFront = mix(1.15, -0.15, clamp(progress, 0.0, 1.0));
  float sweepWidth = mix(1.45, 0.78, clamp(densityBoost, 0.0, 1.5));
  float edgeNoise = fbm(uv * 5.0 + vec2(t * 0.28, -t * 0.17));
  float edgeOffset = (edgeNoise - 0.5) * 0.22;
  float edgeSoftness = mix(0.32, 0.18, clamp(densityBoost, 0.0, 1.5));
  float sweepMask = 1.0 - smoothstep(
    sweepFront - sweepWidth + edgeOffset,
    sweepFront + edgeSoftness + edgeOffset,
    uv.x
  );
  float cloudCore = smoothstep(0.14 - densityBoost * 0.08, 0.82 - densityBoost * 0.16, n * 0.65 + m * 0.35);
  float cloudFringe = smoothstep(0.28, 0.94, blend);
  float transitionCloud = clamp((cloudCore * 0.82 + cloudFringe * 0.35) * sweepMask * vignette, 0.0, 1.0);
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float titleAlpha = clamp(blend * vignette * luma, 0.0, 0.4);
  float opaqueCoverage = clamp(sweepMask * (0.82 + dimStrength * 0.18), 0.0, 1.0);
  float transitionAlpha = clamp(max(opaqueCoverage, transitionCloud * (0.92 + densityBoost * 0.18)), 0.0, 1.0);
  float alpha = mix(titleAlpha, transitionAlpha, step(0.001, transitionAmount));
  vec3 transitionColor = mix(vec3(0.0), color, clamp(transitionCloud * 0.95, 0.0, 1.0));
  color = mix(color, transitionColor, step(0.001, transitionAmount));
  gl_FragColor = vec4(color * alpha, alpha);
}
