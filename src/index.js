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
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0])
  );
  var image = new Image();
  image.src = imgSrc;
  image.onload = function () {
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
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
    .flat(); /* eslint-disable-line */

/** Takes list of locations (=strings) assuming that the
    first one is attribute and rest are uniforms,
    returning proper locations */
const getProgramLocations = (gl, program, locationStrings) => {
  const locations = {};
  locations[locationStrings[0]] = gl.getAttribLocation(
    program,
    locationStrings[0]
  );
  locationStrings.slice(1).forEach((locationString) => {
    locations[locationString] = gl.getUniformLocation(program, locationString);
  });
  return locations;
};

const {
  updatePositionProgram,
  drawParticlesProgram,
  screenProgram,
} = initPrograms(gl);

const texture = gl.createTexture();

loadWindImage(gl, "fresh.jpeg");

const updatePositionAttribAndUniforms = {
  oldPosition: [],
  canvasDimensions: [],
  deltaTime: 0,
  windLookup: 0,
  jsSeed1: 0,
  imageSizePixels: [],
  windLookupOffset: [],
  diff: [],
};

const drawParticlesAttribAndUniforms = {
  position: [],
  matrix: [],
  windLookup: 0,
  canvasDimensions: [],
  colorRamp: 0,
  imageSizePixels: [],
  windLookupOffset: [],
  running: 0,
  diff: [],
};

const screenAttribAndUniforms = {
  u_pos: [],
  u_screen: 0,
  u_opacity: 0,
};

const updatePositionProgLocs = getProgramLocations(
  gl,
  updatePositionProgram,
  Object.keys(updatePositionAttribAndUniforms)
);
const drawParticlesProgLocs = getProgramLocations(
  gl,
  drawParticlesProgram,
  Object.keys(drawParticlesAttribAndUniforms)
);
const screenProgLocs = getProgramLocations(
  gl,
  screenProgram,
  Object.keys(screenAttribAndUniforms)
);

const numParticles = 100000;
const positions = new Float32Array(
  createPoints(numParticles, [[canvas.width], [canvas.height]])
);

let position1Buffer = util.makeBuffer(gl, positions, gl.DYNAMIC_DRAW);
let position2Buffer = util.makeBuffer(gl, positions, gl.DYNAMIC_DRAW);

const updatePositionVA1 = util.makeVertexArray(
  gl,
  position1Buffer,
  updatePositionProgLocs.oldPosition
);

const updatePositionVA2 = util.makeVertexArray(
  gl,
  position2Buffer,
  updatePositionProgLocs.oldPosition
);

const drawVA1 = util.makeVertexArray(
  gl,
  position1Buffer,
  drawParticlesProgLocs.position
);
const drawVA2 = util.makeVertexArray(
  gl,
  position2Buffer,
  drawParticlesProgLocs.position
);

const tf1 = util.makeTransformFeedback(gl, position1Buffer);
const tf2 = util.makeTransformFeedback(gl, position2Buffer);

const framebuffer = gl.createFramebuffer();
const emptyPixels = new Uint8Array(gl.canvas.width * gl.canvas.height * 4);
// screen textures to hold the drawn screen for the previous and the current frame
let backgroundTexture = util.createTexture(
  gl,
  gl.NEAREST,
  emptyPixels,
  gl.canvas.width,
  gl.canvas.height
);
let screenTexture = util.createTexture(
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
  index: 1,
  positionBuffer: position1Buffer,
  texture: screenTexture,
};
let next = {
  updateVA: updatePositionVA2, // read from position2
  tf: tf1, // write to position1
  drawVA: drawVA1, // draw with position1
  index: 2,
  positionBuffer: position2Buffer,
  texture: backgroundTexture,
};

let then = 0;
const ramp = util.createTexture(gl, gl.LINEAR, util.getColorRamp(), 16, 16);
const quadBuffer = util.createBuffer(
  gl,
  new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1])
);
function render(time) {
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.STENCIL_TEST);

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  time *= 0.001;
  // Subtract the previous time from the current time
  const deltaTime = time - then;
  // Remember the current time for the next frame.
  then = time;

  gl.useProgram(updatePositionProgram);

  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.bindVertexArray(current.updateVA);
  gl.uniform2f(
    updatePositionProgLocs.canvasDimensions,
    gl.canvas.width,
    gl.canvas.height
  );
  gl.uniform1f(updatePositionProgLocs.deltaTime, deltaTime);
  gl.uniform1i(updatePositionProgLocs.windLookup, 3);
  gl.uniform1f(updatePositionProgLocs.jsSeed1, Math.random());
  gl.uniform2f(updatePositionProgLocs.imageSizePixels, ...imageSizePixels);
  gl.uniform2f(updatePositionProgLocs.windLookupOffset, ...windLookupOffset);
  gl.uniform2f(updatePositionProgLocs.diff, ...windLookup2CanvasRatio);

  gl.enable(gl.RASTERIZER_DISCARD);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, current.tf);
  gl.beginTransformFeedback(gl.POINTS);

  util.bindAndEnablePointer(
    gl,
    current.positionBuffer,
    updatePositionProgLocs.oldPosition,
    current.updateVA
  );

  gl.drawArrays(gl.POINTS, 0, numParticles);
  gl.endTransformFeedback();
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

  gl.disable(gl.RASTERIZER_DISCARD);

  util.bindFramebuffer(gl, framebuffer, current.texture);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  util.drawTexture(
    next.texture,
    running ? fadeOpacity : 0.9,
    quadBuffer,
    screenProgram,
    gl,
    screenProgLocs
  );

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.useProgram(drawParticlesProgram);
  gl.bindVertexArray(current.drawVA);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.uniform1i(drawParticlesProgLocs.windLookup, 3);
  gl.uniform2f(
    drawParticlesProgLocs.canvasDimensions,
    gl.canvas.width,
    gl.canvas.height
  );
  gl.uniform2f(drawParticlesProgLocs.windLookupOffset, ...windLookupOffset);
  gl.uniform2f(
    drawParticlesProgLocs.imageSizePixels,
    imageSizePixels[0],
    imageSizePixels[1]
  );
  gl.uniform1i(drawParticlesProgLocs.running, running ? 1 : 0);
  gl.uniform2f(drawParticlesProgLocs.diff, ...windLookup2CanvasRatio);

  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, ramp);
  gl.uniform1i(drawParticlesProgLocs.colorRamp, 4);

  gl.uniformMatrix4fv(
    drawParticlesProgLocs.matrix,
    false,
    util.orthographic(0, gl.canvas.width, 0, gl.canvas.height, -1, 1)
  );

  util.bindAndEnablePointer(
    gl,
    current.positionBuffer,
    drawParticlesProgLocs.position,
    current.drawVA
  );
  gl.drawArrays(gl.POINTS, 0, numParticles);

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

  // swap which buffer we will read from
  // and which one we will write to
  const temp2 = current;
  current = next;
  next = temp2;

  /*const temp3 = backgroundTexture;
    backgroundTexture = screenTexture;
    screenTexture = temp3;*/
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
