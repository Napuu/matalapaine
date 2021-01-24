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
  const temp = {
    updatePositionProgram: {
      program: util.createProgram(gl, updatePositionVS, updatePositionFS, [
        "newPosition",
      ]),
      attributes: {
        oldPosition: [],
      },
      uniforms: {
        canvasDimensions: [],
        deltaTime: 0,
        windLookup: 3,
        seed: 0,
        imageSizePixels: [],
        windLookupOffset: [],
        diff: [],
      },
    },

    drawParticlesProgram: {
      program: util.createProgram(gl, drawParticlesVS, drawParticlesFS),
      attributes: {
        position: [],
      },
      uniforms: {
        matrix: [],
        windLookup: 3,
        canvasDimensions: [],
        colorRamp: 4,
        imageSizePixels: [],
        windLookupOffset: [],
        diff: [],
      },
    },

    screenProgram: {
      program: util.createProgram(gl, quadVS, screenFS),
      attributes: {
        a_pos: [],
      },
      uniforms: {
        u_screen: 0,
        u_opacity: 0,
      },
    },
  };

  temp.updatePositionProgram.locations = getProgramLocations(
    gl,
    temp.updatePositionProgram
  );
  temp.drawParticlesProgram.locations = getProgramLocations(
    gl,
    temp.drawParticlesProgram
  );
  temp.screenProgram.locations = getProgramLocations(gl, temp.screenProgram);
  return temp;
};

export const loadWindImage = async (gl, imgSrc, texture) => {
  return new Promise(async (resolve, _reject) => {
    const metadata = await (await fetch(imgSrc + ".meta")).text();
    const image = new Image();
    image.src = imgSrc;
    image.onload = function () {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image
      );
      gl.generateMipmap(gl.TEXTURE_2D);
      resolve({
        bbox: metadata.split(" ").map((a) => parseFloat(a)),
        size: [image.width, image.height]
      });
    };
  });
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

export const getProgramLocations = (gl, container) => {
  const program = container.program;
  return {
    attributes: getLocations(
      gl,
      program,
      Object.keys(container.attributes),
      false
    ),
    uniforms: getLocations(gl, program, Object.keys(container.uniforms), true),
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
  container,
  current,
  texture,
  numParticles
) => {
  gl.useProgram(container.program);

  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.bindVertexArray(current.updateVA);

  setUniforms(gl, container.program, container.locations, container);

  gl.enable(gl.RASTERIZER_DISCARD);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, current.tf);
  gl.beginTransformFeedback(gl.POINTS);

  util.bindAndEnablePointer(
    gl,
    current.positionBuffer,
    container.attributes.oldPosition,
    current.updateVA
  );

  gl.drawArrays(gl.POINTS, 0, numParticles);
  gl.endTransformFeedback();
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

  gl.disable(gl.RASTERIZER_DISCARD);
};

export const drawParticles = (gl, container, current, ramp, numParticles) => {
  gl.useProgram(container.program);
  gl.bindVertexArray(current.drawVA);

  setUniforms(gl, container.program, container.locations, container);

  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, ramp);

  util.bindAndEnablePointer(
    gl,
    current.positionBuffer,
    container.attributes.position,
    current.drawVA
  );
  gl.drawArrays(gl.POINTS, 0, numParticles);
};

export const drawFadedPreviousFrame = (
  gl,
  container,
  framebuffer,
  current,
  next,
  fadeOpacity,
  quadBuffer
) => {
  util.bindFramebuffer(gl, framebuffer, next.texture);
  util.drawTexture(
    current.texture,
    fadeOpacity,
    quadBuffer,
    container.program,
    gl,
    container.locations
  );
};

export const drawScreen = (gl, container, current, quadBuffer) => {
  util.bindFramebuffer(gl, null);
  util.drawTexture(
    current.texture,
    1.0,
    quadBuffer,
    container.program,
    gl,
    container.locations
  );
};

export const initState = (gl, numParticles) => {
  const positions = new Float32Array(
    createPoints(numParticles, [[gl.canvas.width], [gl.canvas.height]])
  );
  const position1Buffer = util.makeBuffer(gl, positions, gl.DYNAMIC_DRAW);
  const position2Buffer = util.makeBuffer(gl, positions, gl.DYNAMIC_DRAW);
  const emptyPixels = new Uint8Array(gl.canvas.width * gl.canvas.height * 4);
  return {
    current: {
      updateVA: gl.createVertexArray(),
      drawVA: gl.createVertexArray(),
      tf: util.makeTransformFeedback(gl, position2Buffer),
      positionBuffer: position1Buffer,
      texture: util.createTexture(
        gl,
        gl.NEAREST,
        emptyPixels,
        gl.canvas.width,
        gl.canvas.height
      ),
    },
    next: {
      updateVA: gl.createVertexArray(),
      drawVA: gl.createVertexArray(),
      tf: util.makeTransformFeedback(gl, position1Buffer),
      positionBuffer: position2Buffer,
      texture: util.createTexture(
        gl,
        gl.NEAREST,
        emptyPixels,
        gl.canvas.width,
        gl.canvas.height
      ),
    },
    framebuffer: gl.createFramebuffer(),
  };
};

export const resetAnimation = (
  gl,
  canvas,
  pxRatio,
  numParticles,
  drawProgram,
  updateProgram
) => {
  gl.canvas.width = canvas.clientWidth * pxRatio;
  gl.canvas.height = canvas.clientHeight * pxRatio;
  updateProgram.uniforms.canvasDimensions = [gl.canvas.width, gl.canvas.height];
  drawProgram.uniforms.canvasDimensions = [gl.canvas.width, gl.canvas.height];
  drawProgram.uniforms.matrix = util.orthographic(
    0,
    gl.canvas.width,
    0,
    gl.canvas.height,
    -1,
    1
  );
  return initState(gl, numParticles);
};
