import { Map } from "maplibre-gl";
import proj4 from "proj4";
const imageBboxEPSG4326 = [-42, 40, 48, 80];
const imageSizePixels = [1204, 1283];
const imageBboxEPSG3857 = [
  ...proj4("EPSG:3857", imageBboxEPSG4326.slice(0, 2)),
  ...proj4("EPSG:3857", imageBboxEPSG4326.slice(2)),
];

let windLookupOffset = [0, 0],
  windLookup2CanvasRatio = [0, 0];
let running = true;

import updatePositionVS from "./shaders/updatePositionVS.glsl";
import drawParticlesVS from "./shaders/drawParticlesVS.glsl";
import drawParticlesFS from "./shaders/drawParticlesFS.glsl";
import screenFS from "./shaders/screenFS.glsl";
import quadVS from "./shaders/quadVS.glsl";
import updatePositionFS from "./shaders/updatePositionFS.glsl";
import * as util from "./util";

const canvas = document.querySelector("#c");
const gl = canvas.getContext("webgl2", { antialias: false });

// Get A WebGL context
/** @type {HTMLCanvasElement} */
if (!gl) {
  alert("??");
}

let pxRatio = Math.max(Math.floor(window.devicePixelRatio) || 1, 2);
canvas.width = canvas.clientWidth * pxRatio;
canvas.height = canvas.clientHeight * pxRatio;
const fadeOpacity = 0.99;

const initPrograms = (gl) => {
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

const loadWindImage = async (gl, imgSrc) => {
  const image = new Image();
  image.src = imgSrc;
  image.onload = function () {
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    // TODO move these somewhere from here
    updatePositionAttributesAndUniforms.uniforms.imageSizePixels = [
      image.width,
      image.height,
    ];
    drawParticlesAttributesAndUniforms.uniforms.imageSizePixels = [
      image.width,
      image.height,
    ];
  };
};

const rand = (min, max) => {
  if (max === undefined) {
    max = min;
    min = 0;
  }
  return Math.random() * (max - min) + min;
};

const createPoints = (num, ranges) =>
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

const getProgramLocations = (gl, program, locations) => {
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

const updateParticles = (
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

  updatePositionAttributesAndUniforms.uniforms = {
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

const drawParticles = (
  gl,
  program,
  locs,
  values,
  current,
  newUniforms,
  ramp
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
    drawParticlesProgLocs.attributes.position,
    current.drawVA
  );
  gl.drawArrays(gl.POINTS, 0, numParticles);
};

const drawFadedPreviousFrame = (
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
    running ? fadeOpacity : 0.9,
    quadBuffer,
    screenProgram,
    gl,
    screenProgLocs
  );
};

const drawScreen = (gl, screenProgram, screenProgLocs, current, quadBuffer) => {
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

const {
  updatePositionProgram,
  drawParticlesProgram,
  screenProgram,
} = initPrograms(gl);

const texture = gl.createTexture();

loadWindImage(gl, "fresh.jpeg");

const updatePositionAttributesAndUniforms = {
  attributes: {
    oldPosition: [],
  },
  uniforms: {
    canvasDimensions: [gl.canvas.width, gl.canvas.height],
    deltaTime: 0,
    windLookup: 3,
    jsSeed1: 0,
    imageSizePixels: [],
    windLookupOffset: [],
    diff: [],
  },
};

const drawParticlesAttributesAndUniforms = {
  attributes: {
    position: [],
  },
  uniforms: {
    matrix: util.orthographic(0, gl.canvas.width, 0, gl.canvas.height, -1, 1),
    windLookup: 3,
    canvasDimensions: [gl.canvas.width, gl.canvas.height],
    colorRamp: 4,
    imageSizePixels: [],
    windLookupOffset: [],
    running: 0,
    diff: [],
  },
};

const screenAttributesAndUniforms = {
  attributes: {
    a_pos: [],
  },
  uniforms: {
    u_screen: 0,
    u_opacity: 0,
  },
};

const updatePositionProgLocs = getProgramLocations(
  gl,
  updatePositionProgram,
  updatePositionAttributesAndUniforms
);
const drawParticlesProgLocs = getProgramLocations(
  gl,
  drawParticlesProgram,
  drawParticlesAttributesAndUniforms
);
const screenProgLocs = getProgramLocations(
  gl,
  screenProgram,
  screenAttributesAndUniforms
);

const numParticles = 100000;
const positions = new Float32Array(
  createPoints(numParticles, [[canvas.width], [canvas.height]])
);

const position1Buffer = util.makeBuffer(gl, positions, gl.DYNAMIC_DRAW);
const position2Buffer = util.makeBuffer(gl, positions, gl.DYNAMIC_DRAW);

const updatePositionVA1 = util.makeVertexArray(
  gl,
  position1Buffer,
  updatePositionProgLocs.attributes.oldPosition
);

const updatePositionVA2 = util.makeVertexArray(
  gl,
  position2Buffer,
  updatePositionProgLocs.attributes.oldPosition
);

const drawVA1 = util.makeVertexArray(
  gl,
  position1Buffer,
  drawParticlesProgLocs.attributes.position
);
const drawVA2 = util.makeVertexArray(
  gl,
  position2Buffer,
  drawParticlesProgLocs.attributes.position
);

const tf1 = util.makeTransformFeedback(gl, position1Buffer);
const tf2 = util.makeTransformFeedback(gl, position2Buffer);

const framebuffer = gl.createFramebuffer();
const emptyPixels = new Uint8Array(gl.canvas.width * gl.canvas.height * 4);
// screen textures to hold the drawn screen for the previous and the current frame
const texture1 = util.createTexture(
  gl,
  gl.NEAREST,
  emptyPixels,
  gl.canvas.width,
  gl.canvas.height
);
const texture2 = util.createTexture(
  gl,
  gl.NEAREST,
  emptyPixels,
  gl.canvas.width,
  gl.canvas.height
);

let current = {
  updateVA: updatePositionVA1, // read from position1
  tf: tf2, // write to position2
  drawVA: drawVA2, // draw with position2
  positionBuffer: position1Buffer,
  texture: texture1,
};
let next = {
  updateVA: updatePositionVA2, // read from position2
  tf: tf1, // write to position1
  drawVA: drawVA1, // draw with position1
  positionBuffer: position2Buffer,
  texture: texture2,
};

const ramp = util.createTexture(gl, gl.LINEAR, util.getColorRamp(), 16, 16);
const quadBuffer = util.createBuffer(
  gl,
  new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1])
);

let then = 0;
function render(time) {
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  time *= 0.001;

  const deltaTime = time - then;

  then = time;

  updateParticles(
    gl,
    updatePositionProgram,
    updatePositionProgLocs,
    updatePositionAttributesAndUniforms,
    current,
    {
      jsSeed1: Math.random(),
      diff: windLookup2CanvasRatio,
      windLookupOffset,
      deltaTime,
    },
    texture,
    numParticles
  );

  drawFadedPreviousFrame(
    gl,
    screenProgram,
    screenProgLocs,
    framebuffer,
    current,
    next,
    running,
    fadeOpacity,
    quadBuffer
  );

  drawParticles(
    gl,
    drawParticlesProgram,
    drawParticlesProgLocs,
    drawParticlesAttributesAndUniforms,
    current,
    {
      diff: windLookup2CanvasRatio,
      windLookupOffset,
      running,
    },
    ramp
  );

  drawScreen(gl, screenProgram, screenProgLocs, current, quadBuffer);

  // swap buffers, transformfeedbacks etc.
  const temp = current;
  current = next;
  next = temp;

  requestAnimationFrame(render);
}
const map = new Map({
  container: "map",
  pitchWithRotate: false,
  dragRotate: false,
  style: {
    version: 8,
    sources: {
      land: {
        type: "vector",
        tiles: [
          //'https://projects.napuu.xyz/naturalearth/maps/land/{z}/{x}/{y}.pbf'
          "http://192.168.1.228:29090/maps/land/{z}/{x}/{y}.pbf",
        ],
        minzoom: 0,
        maxzoom: 6,
      },
    },
    layers: [
      {
        id: "water",
        type: "background",
        paint: {
          "background-color": "#333333",
        },
      },
      {
        id: "borders",
        type: "line",
        source: "land",
        "source-layer": "land",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-opacity": 1.0,
          "line-color": "rgb(130, 130, 130)",
          "line-width": 1.5,
        },
      },
    ],
  },
  center: [8, 63],
  zoom: 4,
});

map.touchZoomRotate.disableRotation();
const updateLayerBounds = (b) => {
  /*
    if (resizeCanvasToDisplaySize(gl.canvas, pxRatio)) {
    resizeFramebufferInfo(gl, fadeFbi1, fadeAttachments);
    resizeFramebufferInfo(gl, fadeFbi2, fadeAttachments);
    }
  */
  const imageWidthEPSG3857 = imageBboxEPSG3857[2] - imageBboxEPSG3857[0];
  const imageHeightEPSG3857 = imageBboxEPSG3857[3] - imageBboxEPSG3857[1];
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  const mapBounds = [
    ...proj4("EPSG:3857", [b._sw.lng, b._sw.lat]),
    ...proj4("EPSG:3857", [b._ne.lng, b._ne.lat]),
  ];
  windLookup2CanvasRatio = [
    ((mapBounds[2] - mapBounds[0]) / imageWidthEPSG3857) *
      (imageSizePixels[0] / gl.canvas.width),
    ((mapBounds[3] - mapBounds[1]) / imageHeightEPSG3857) *
      (imageSizePixels[1] / gl.canvas.height),
  ];
  windLookupOffset = [
    ((mapBounds[0] - imageBboxEPSG3857[0]) / imageWidthEPSG3857) *
      imageSizePixels[0],
    ((mapBounds[1] - imageBboxEPSG3857[1]) / imageHeightEPSG3857) *
      imageSizePixels[1],
  ];
};

window.onresize = () => {
  console.log("???? hello");
  canvas.width = canvas.clientWidth * pxRatio;
  canvas.height = canvas.clientHeight * pxRatio;
  const emptyPixels2 = new Uint8Array(gl.canvas.width * gl.canvas.height * 4);
  // screen textures to hold the drawn screen for the previous and the current frame
  current.texture = util.createTexture(
    gl,
    gl.NEAREST,
    emptyPixels2,
    gl.canvas.width,
    gl.canvas.height
  );
  next.texture = util.createTexture(
    gl,
    gl.NEAREST,
    emptyPixels2,
    gl.canvas.width,
    gl.canvas.height
  );
  gl.clear(gl.COLOR_BUFFER_BIT);
  updateLayerBounds(map.getBounds());
};

map.on("movestart", () => {
  running = false;
});

map.on("moveend", () => {
  running = true;
  updateLayerBounds(map.getBounds());
});

map.on("load", () => {
  updateLayerBounds(map.getBounds());
  requestAnimationFrame(render);
  map.fitBounds([-28, 65, 39, 65]);
});
