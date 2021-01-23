import updatePositionVS from "./shaders/updatePositionVS.glsl";
import drawParticlesVS from "./shaders/drawParticlesVS.glsl";
import drawParticlesFS from "./shaders/drawParticlesFS.glsl";
import screenFS from "./shaders/screenFS.glsl";
import quadVS from "./shaders/quadVS.glsl";
import updatePositionFS from "./shaders/updatePositionFS.glsl";
import * as util from "./util";

export const createUpdateProgram = (gl) => {
  return util.createProgram(gl, updatePositionVS, updatePositionFS, [
    "newPosition",
  ]);
};

export const createDrawProgram = (gl) => {
  return util.createProgram(gl, drawParticlesVS, drawParticlesFS);
};

export const createScreenProgram = (gl) => {
  return util.createProgram(gl, quadVS, screenFS);
};

export const initPrograms = (gl) => {
  return {
    updatePositionProgram: util.createProgram(
      gl,
      updatePositionVS,
      updatePositionFS,
      ["newPosition"]
    ),
    drawParticlesProgram: util.createProgram(
      gl,
      drawParticlesVS,
      drawParticlesFS
    ),
    screenProgram: util.createProgram(gl, quadVS, screenFS),
  };
};

export const loadWindImage = async (gl, imgSrc, texture) => {
  const image = new Image();
  image.src = imgSrc;
  image.onload = function () {
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    // TODO move these somewhere from here
  };
};

const rand = (min, max) => {
  if (max === undefined) {
    max = min;
    min = 0;
  }
  return Math.random() * (max - min) + min;
};

export const createPoints = (num, ranges) =>
  new Array(num)
    .fill(0)
    .map((_) => ranges.map((range) => rand(...range)))
    .flat();
/** Takes list of uniform locations
 *  and returns corresponding locations from WebGL side */
const getLocations = (gl, program, locationStrings, isUniform = true) => {
  const locations = {};
  locationStrings.forEach((locationString) => {
    locations[locationString] = isUniform
      ? gl.getUniformLocation(program, locationString)
      : gl.getAttribLocation(program, locationString);
  });
  return locations;
};

export const getProgramLocations = (gl, program, locations) => {
  return {
    attributes: getLocations(
      gl,
      program,
      Object.keys(locations.attributes),
      false
    ),
    uniforms: getLocations(gl, program, Object.keys(locations.uniforms), true),
  };
};

const setUniforms = (gl, program, locs, values) => {
  gl.useProgram(program);
  Object.keys(locs.uniforms).forEach((uniformString) => {
    const loc = locs.uniforms[uniformString];
    const val = values.uniforms[uniformString];
    if (values.uniforms.length === 1) gl.uniform1f(loc, ...val);
    else if (val.length === 2) gl.uniform2f(loc, ...val);
    else if (val.length === 3) gl.uniform3f(loc, ...val);
    else if (val.length === 4) gl.uniform4f(loc, ...val);
    else if (val.length > 4) gl.uniformMatrix4fv(loc, false, val);
    else if (val.toString().includes(".")) gl.uniform1f(loc, val);
    else if (val.length !== 0) gl.uniform1i(loc, val);
  });
};

export const updateParticles = (
  gl,
  program,
  locs,
  values,
  current,
  newUniforms,
  texture,
  numParticles
) => {
  gl.useProgram(program);

  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.bindVertexArray(current.updateVA);

  values.uniforms = {
    ...values.uniforms,
    ...newUniforms,
  };
  setUniforms(gl, program, locs, values);

  gl.enable(gl.RASTERIZER_DISCARD);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, current.tf);
  gl.beginTransformFeedback(gl.POINTS);

  util.bindAndEnablePointer(
    gl,
    current.positionBuffer,
    locs.attributes[0],
    current.updateVA
  );

  gl.drawArrays(gl.POINTS, 0, numParticles);
  gl.endTransformFeedback();
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

  gl.disable(gl.RASTERIZER_DISCARD);
};

export const updateParticles2 = (gl, state) => {
  gl.useProgram(state.updateProgramContainer.program);

  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, c.texture);
  gl.bindVertexArray(c.current.updateVA);

  setUniforms(gl, state.updateProgramContainer.program, locs, values);

  gl.enable(gl.RASTERIZER_DISCARD);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, current.tf);
  gl.beginTransformFeedback(gl.POINTS);

  util.bindAndEnablePointer(
    gl,
    current.positionBuffer,
    locs.attributes[0],
    current.updateVA
  );

  gl.drawArrays(gl.POINTS, 0, numParticles);
  gl.endTransformFeedback();
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

  gl.disable(gl.RASTERIZER_DISCARD);
};

export const drawParticles = (
  gl,
  program,
  locs,
  values,
  current,
  newUniforms,
  ramp,
  numParticles
) => {
  gl.useProgram(program);
  gl.bindVertexArray(current.drawVA);
  values.uniforms = {
    ...values.uniforms,
    /*
    running,
    diff: windLookup2CanvasRatio,
    windLookupOffset,
    */
    ...newUniforms,
  };
  setUniforms(gl, program, locs, values);

  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, ramp);

  util.bindAndEnablePointer(
    gl,
    current.positionBuffer,
    values.position,
    current.drawVA
  );
  gl.drawArrays(gl.POINTS, 0, numParticles);
};

export const drawFadedPreviousFrame = (
  gl,
  screenProgram,
  screenProgLocs,
  framebuffer,
  current,
  next,
  running,
  fadeOpacity,
  quadBuffer
) => {
  util.bindFramebuffer(gl, framebuffer, current.texture);
  util.drawTexture(
    next.texture,
    running ? fadeOpacity : 0.8,
    quadBuffer,
    screenProgram,
    gl,
    screenProgLocs
  );
};

export const drawScreen = (
  gl,
  screenProgram,
  screenProgLocs,
  current,
  quadBuffer
) => {
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  util.bindFramebuffer(gl, null);
  util.drawTexture(
    current.texture,
    1.0,
    quadBuffer,
    screenProgram,
    gl,
    screenProgLocs
  );
  gl.disable(gl.BLEND);
};
