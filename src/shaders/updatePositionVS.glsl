#version 300 es
precision highp float;
in vec2 oldPosition;

uniform float deltaTime;
uniform vec2 canvasDimensions;

uniform vec2 imageSizePixels;
uniform vec2 windLookupOffset;
uniform vec2 diff;

out vec2 newPosition;

uniform sampler2D windLookup;
uniform float seed;

const vec3 rand_constants = vec3(12.9898, 78.233, 4375.85453);
float rand(const vec2 co) {
  float t = dot(rand_constants.xy, co);
  return fract(sin(t) * (rand_constants.z + t));
}

vec2 ext2img(float x, float y) {
  return vec2(x * diff.x + windLookupOffset[0], y * diff.y + windLookupOffset[1]);
}

// gold noise implementation from https://stackoverflow.com/a/28095165/1550017
float PHI = 1.61803398874989484820459;  // Φ = Golden Ratio
float gold_noise(vec2 xy, float seed){
  return fract(tan(distance(xy*PHI, xy)*seed)*xy.x);
}

vec2 randPos(float seed, vec2 ll) {
  return vec2(gold_noise(ll + 1., seed + 1.) * (canvasDimensions.x + 20.)-10., gold_noise(ll, seed) * (canvasDimensions.y + 20.) - 10.);
}

void main() {
  vec2 lookuppos = ext2img(oldPosition.x, oldPosition.y);
  lookuppos.x /= imageSizePixels.x;
  lookuppos.y /= imageSizePixels.y;
  lookuppos.y = 1. - lookuppos.y;
  vec4 windspeed = texture(windLookup, lookuppos);
  windspeed -= 0.5;
  vec2 seed1 = lookuppos * seed;
  float windspeedmeters = length(windspeed.xy);
  float reset = step(.99 - windspeedmeters * 0.05, gold_noise(oldPosition, seed));
  windspeed *= 100.;
  vec2 temp = oldPosition + windspeed.xy * deltaTime * 5.0;
  // if degeneration continues, replacing seed below with seed3 worked earlier
  float seed3 = fract(deltaTime);
  vec2 randPos2 = randPos(seed, oldPosition * seed3);
  //vec2 randPos2 = vec
  newPosition = mix(temp, randPos2, reset);
}
