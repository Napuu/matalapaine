#version 300 es
in vec4 position;
uniform mat4 matrix;

uniform vec2 canvasDimensions;

out vec4 windColor;
uniform sampler2D windLookup;

uniform vec2 windLookupOffset;
uniform vec2 imageSizePixels;
uniform vec2 windLookup2CanvasRatio;

uniform sampler2D colorRamp;
vec2 ext2img(float x, float y) {
  return vec2(x * windLookup2CanvasRatio.x + windLookupOffset[0], y * windLookup2CanvasRatio.y + windLookupOffset[1]);
}

void main() {
  // do the common matrix math
  vec2 lookuppos = ext2img(position.x, position.y);
  lookuppos.x /= imageSizePixels.x;
  lookuppos.y /= imageSizePixels.y;
  lookuppos.y = 1. - lookuppos.y;
  vec4 colorthing = texture(windLookup, lookuppos) ;
  colorthing.x -= 0.5;
  vec4 windspeed = texture(windLookup, lookuppos);
  float windspeedmeters = windspeed.z;
  if (windspeedmeters > 10. / 255.) {
    windColor = vec4(1., 0., 0., 1.);
  } else {
    windColor = vec4(1., 1., 0., 1.);
  }

  float xa = windspeedmeters * 25.;

  // color ramp is encoded in a 16x16 texture
  vec2 ramp_pos = vec2(
      fract(16.0 * xa),
      //16.0,
      floor(16.0 * xa) / 16.0);
  //16.0);

  windColor = texture(colorRamp, ramp_pos);
  windColor[3] = 0.8;
  vec4 invisible = vec4(0., 0., 0., 0.);
  if (lookuppos.y > 1. || lookuppos.y < 0. || lookuppos.x > 1. || lookuppos.x < 0.) {
    windColor = invisible;
  }
  gl_Position = matrix * position;
  gl_PointSize = 2.0;
}
