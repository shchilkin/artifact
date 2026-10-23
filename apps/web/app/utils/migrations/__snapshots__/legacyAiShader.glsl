float legacyHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed * 0.017) * 43758.5453);
}
float legacyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(legacyHash(i), legacyHash(i + vec2(1.0, 0.0)), u.x),
    mix(legacyHash(i + vec2(0.0, 1.0)), legacyHash(i + vec2(1.0)), u.x), u.y);
}
float legacyFbm(vec2 p, float octaves, float seedOffset) {
  float value = 0.0;
  float amplitude = 0.5;
  float normalization = 0.0;
  for (int octave = 0; octave < 7; octave++) {
    if (float(octave) < octaves) {
      value += legacyNoise(p + seedOffset * 0.001 + float(octave) * 0.13) * amplitude;
      normalization += amplitude;
    }
    p *= 2.0;
    amplitude *= 0.5;
  }
  return normalization > 0.0 ? value / normalization : 0.0;
}
float legacyLuma(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }
float legacySmoothstep(float edge0, float edge1, float value) {
  float normalized = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
  return normalized * normalized * (3.0 - 2.0 * normalized);
}
vec3 legacyPalette(float value) {
  value = clamp(value, 0.0, 0.9999);
  if (value <= 0.50000000) return mix(vec3(0.04313725, 0.00000000, 0.08627451), vec3(1.00000000, 0.23921569, 0.94901961), (value - 0.00000000) / 0.50000000);
  if (value <= 1.00000000) return mix(vec3(1.00000000, 0.23921569, 0.94901961), vec3(0.96470588, 1.00000000, 0.41960784), (value - 0.50000000) / 0.50000000);
  return vec3(0.96470588, 1.00000000, 0.41960784);
}
vec4 mainImage(vec2 uv) {
  vec4 source = texture2D(u_backdrop, uv);
  vec2 point = (uv * 2.0 - 1.0) * vec2(u_resolution.x / max(1.0, u_resolution.y), 1.0);
  float radius = length(point);
  float angle = atan(point.y, point.x);
  float tone = 0.40000000;
  float contrast = 1.60000000;
  vec3 color = source.rgb;
  float mapped = 0.0;
  tone += (legacyFbm(point * 5.00000000, 5.00000000, 12.00000000) - 0.5) * 0.40000000;
  tone += sin(dot(point, vec2(0.70710678, 0.70710678)) * 9.00000000 + 1.00000000) * 0.30000000;
  {
    float shortSide = min(u_resolution.x, u_resolution.y);
    vec2 shift = vec2(0.01212436, 0.00700000) * shortSide / max(u_resolution, vec2(1.0));
    color.r = texture2D(u_backdrop, clamp(uv + shift, 0.0, 1.0)).r;
    color.b = texture2D(u_backdrop, clamp(uv - shift, 0.0, 1.0)).b;
  }
  tone = floor(clamp(tone, 0.0, 1.0) * (max(2.0, 16.00000000) - 1.0) + 0.5) / (max(2.0, 16.00000000) - 1.0);
  vec3 proceduralColor = legacyPalette(clamp((tone - 0.5) * contrast + 0.5, 0.0, 1.0));
  color = mix(color, proceduralColor, mapped > 0.5 ? 0.074 : 0.37);
  return vec4(color, source.a);
}