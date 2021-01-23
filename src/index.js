import { Map } from "maplibre-gl";
import proj4 from "proj4";
import {
  initPrograms,
  loadWindImage,
  createPoints,
  getProgramLocations,
  updateParticles,
  drawParticles,
  drawScreen,
  drawFadedPreviousFrame,
} from "./webgl";
const imageBboxEPSG4326 = [-42, 40, 48, 80];
const imageSizePixels = [1204, 1283];
const imageBboxEPSG3857 = [
  ...proj4("EPSG:3857", imageBboxEPSG4326.slice(0, 2)),
  ...proj4("EPSG:3857", imageBboxEPSG4326.slice(2)),
];

let windLookupOffset = [0, 0],
  windLookup2CanvasRatio = [0, 0];
let running = true;

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

const {
  updatePositionProgram,
  drawParticlesProgram,
  screenProgram,
} = initPrograms(gl);

const texture = gl.createTexture();

loadWindImage(gl, "fresh.jpeg", texture);

const updatePositionAttributesAndUniforms = {
  attributes: {
    oldPosition: [],
  },
  uniforms: {
    canvasDimensions: [gl.canvas.width, gl.canvas.height],
    deltaTime: 0,
    windLookup: 3,
    jsSeed1: 0,
    imageSizePixels,
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
    imageSizePixels,
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
    ramp,
    numParticles
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
          //"http://192.168.1.228:29090/maps/land/{z}/{x}/{y}.pbf",
          "http://localhost:29090/maps/land/{z}/{x}/{y}.pbf",
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
  console.log("loaded");
});
