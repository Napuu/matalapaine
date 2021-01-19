#version 300 es
in vec4 position;
uniform mat4 matrix;

uniform vec2 canvasDimensions;

out vec4 windColor;
uniform sampler2D windLookup;

uniform vec2 southwest;
uniform vec2 imgSW3857;
uniform vec2 imgNE3857;
uniform vec2 northeast;
uniform vec2 pixelBounds;
uniform vec2 diff;
uniform int running;


uniform sampler2D colorRamp;
vec2 ext2img(float x, float y) {
  float x0 = ((southwest.x - imgSW3857.x) / (imgNE3857.x - imgSW3857.x)) * pixelBounds.x;
  float y0 = ((southwest.y - imgSW3857.y) / (imgNE3857.y - imgSW3857.y)) * pixelBounds.y;
  return vec2(x * diff.x + x0, y * diff.y + y0);
}

void main() {
  // do the common matrix math
  vec2 lookuppos = ext2img(position.x, position.y);
  lookuppos.x /= pixelBounds.x;
  lookuppos.y /= pixelBounds.y;
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
  vec4 invisible = vec4(0., 0., 0., 0.);
  if (running == 0 || lookuppos.y > 1. || lookuppos.y < 0. || lookuppos.x > 1. || lookuppos.x < 0.) {
    windColor = invisible;
  }
  gl_Position = matrix * position;
  gl_PointSize = 2.0;
}
