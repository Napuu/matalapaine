import updatePositionVS from "./shaders/updatePositionVS.js";
import drawParticlesVS from "./shaders/drawParticlesVS.js";
import drawParticlesFS from "./shaders/drawParticlesFS.js";
import screenFS from "./shaders/screenFS.js";
import quadVS from "./shaders/quadVS.js";
import updatePositionFS from "./shaders/updatePositionFS.js";
import proj4 from "proj4";
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
    updateProgram: {
      program: util.createProgram(gl, updatePositionVS, updatePositionFS, [
        "newPosition",
      ]),
      attributes: {
        oldPosition: [],
      },
      uniforms: {
        canvasDimensions: [1, 1],
        deltaTime: 0,
        windLookup: 3,
        seed: 0,
        imageSizePixels: [1, 1],
        windLookupOffset: [1, 1],
        windLookup2CanvasRatio: [1, 1],
      },
    },

    drawProgram: {
      program: util.createProgram(gl, drawParticlesVS, drawParticlesFS),
      attributes: {
        position: [],
      },
      uniforms: {
        matrix: [],
        windLookup: 3,
        canvasDimensions: [1, 1],
        colorRamp: 4,
        imageSizePixels: [1, 1],
        windLookupOffset: [1, 1],
        windLookup2CanvasRatio: [1, 1],
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

  temp.updateProgram.locations = getProgramLocations(gl, temp.updateProgram);
  temp.drawProgram.locations = getProgramLocations(gl, temp.drawProgram);
  temp.screenProgram.locations = getProgramLocations(gl, temp.screenProgram);
  return temp;
};

export const loadWindImage = async (gl, imgSrc, texture) => {
  return new Promise(async (resolve, _reject) => {
    // using hardcoded metadata now as only one forecast source is used
    // const metadata = await (await fetch(imgSrc + ".meta")).text();
    const metadata = "-180 -85.051 180 85.051";
    const image = new Image();
    // debug
    // image.src = "debug2.jpeg";
    image.src = imgSrc;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
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
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);

      gl.generateMipmap(gl.TEXTURE_2D);
      const bbox4326 = metadata.split(" ").map((a) => parseFloat(a));
      resolve({
        bbox4326,
        bbox3857: [
          ...proj4("EPSG:3857", bbox4326.slice(0, 2)),
          ...proj4("EPSG:3857", bbox4326.slice(2)),
        ],
        size: [image.width, image.height],
        data: ctx.getImageData(0, 0, image.width, image.height).data,
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
    else if (Number.isInteger(val)) gl.uniform1i(loc, val);
    else gl.uniform1f(loc, val);
  });
};

export const updateParticles = (gl, container, state, texture) => {
  gl.useProgram(container.program);

  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.bindVertexArray(state.current.updateVA);

  setUniforms(gl, container.program, container.locations, container);

  gl.enable(gl.RASTERIZER_DISCARD);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, state.current.tf);
  gl.beginTransformFeedback(gl.POINTS);

  util.bindAndEnablePointer(
    gl,
    state.current.positionBuffer,
    container.attributes.oldPosition,
    state.current.updateVA
  );

  gl.drawArrays(gl.POINTS, 0, state.numParticles);
  gl.endTransformFeedback();
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

  gl.disable(gl.RASTERIZER_DISCARD);
};

export const drawParticles = (gl, container, state) => {
  gl.useProgram(container.program);
  gl.bindVertexArray(state.current.drawVA);

  setUniforms(gl, container.program, container.locations, container);

  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, state.colorRamp);

  util.bindAndEnablePointer(
    gl,
    state.current.positionBuffer,
    container.attributes.position,
    state.current.drawVA
  );
  gl.drawArrays(gl.POINTS, 0, state.numParticles);
};

export const drawFadedPreviousFrame = (gl, container, state) => {
  util.bindFramebuffer(gl, state.framebuffer, state.next.texture);
  util.drawTexture(
    state.current.texture,
    0.99999,
    state.quadBuffer,
    container.program,
    gl,
    container.locations
  );
};

export const drawScreen = (gl, container, state, disableBlend, drawProgram) => {
  drawFadedPreviousFrame(gl, container, state);

  drawParticles(gl, drawProgram, state);

  // combination of chrome, webgl2 and blend seems to be kind of buggy
  if (!disableBlend) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
  util.bindFramebuffer(gl, null);
  util.drawTexture(
    state.current.texture,
    1.0,
    state.quadBuffer,
    container.program,
    gl,
    container.locations
  );
  if (!disableBlend) {
    gl.disable(gl.BLEND);
  }
};

export const initState = (gl, numParticles, pxRatio) => {
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
    colorRamp: util.createTexture(
      gl,
      gl.LINEAR,
      util.getColorRamp().array,
      16,
      16
    ),
    quadBuffer: util.createBuffer(
      gl,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1])
    ),
    numParticles,
    running: true,
    pxRatio,
  };
};

export const resetAnimation = (
  gl,
  canvas,
  pxRatio,
  particleDensity,
  drawProgram,
  updateProgram
) => {
  gl.canvas.width = canvas.clientWidth * pxRatio;
  gl.canvas.height = canvas.clientHeight * pxRatio;
  updateProgram.uniforms.canvasDimensions = [gl.canvas.width, gl.canvas.height];
  drawProgram.uniforms.canvasDimensions = [gl.canvas.width, gl.canvas.height];
  const numParticles = Math.floor(
    (gl.canvas.width * gl.canvas.height * particleDensity) / 1000
  );
  drawProgram.uniforms.matrix = util.orthographic(
    0,
    gl.canvas.width,
    0,
    gl.canvas.height,
    -1,
    1
  );
  return initState(gl, numParticles, pxRatio);
};

export const updateLayerBounds = (
  gl,
  b,
  imageSpecs,
  updateProgram,
  drawProgram
) => {
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  const imageWidthEPSG3857 = imageSpecs.bbox3857[2] - imageSpecs.bbox3857[0];
  const imageHeightEPSG3857 = imageSpecs.bbox3857[3] - imageSpecs.bbox3857[1];
  const mapBounds = [
    ...proj4("EPSG:3857", [b._sw.lng, b._sw.lat]),
    ...proj4("EPSG:3857", [b._ne.lng, b._ne.lat]),
  ];
  const windLookup2CanvasRatio = [
    ((mapBounds[2] - mapBounds[0]) / imageWidthEPSG3857) *
      (imageSpecs.size[0] / gl.canvas.width),
    ((mapBounds[3] - mapBounds[1]) / imageHeightEPSG3857) *
      (imageSpecs.size[1] / gl.canvas.height),
  ];
  const windLookupOffset = [
    ((mapBounds[0] - imageSpecs.bbox3857[0]) / imageWidthEPSG3857) *
      imageSpecs.size[0],
    ((mapBounds[1] - imageSpecs.bbox3857[1]) / imageHeightEPSG3857) *
      imageSpecs.size[1],
  ];
  updateProgram.uniforms.windLookup2CanvasRatio = windLookup2CanvasRatio;
  updateProgram.uniforms.windLookupOffset = windLookupOffset;
  drawProgram.uniforms.windLookup2CanvasRatio = windLookup2CanvasRatio;
  drawProgram.uniforms.windLookupOffset = windLookupOffset;
};
