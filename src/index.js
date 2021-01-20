import { Map } from "maplibre-gl";
import proj4 from "proj4";
const imageBboxEPSG4326 = [-42, 40, 48, 80];
const imageSizePixels = [1204, 1283];
const imageBboxEPSG3857 = [
  ...proj4('EPSG:3857', imageBboxEPSG4326.slice(0, 2)),
  ...proj4('EPSG:3857', imageBboxEPSG4326.slice(2))
];

let windLookupOffset = [0, 0], windLookup2CanvasRatio = [0, 0];
let running = true;

import updatePositionVS from "./shaders/updatePositionVS.glsl";
import drawParticlesVS from "./shaders/drawParticlesVS.glsl";
import drawParticlesFS from "./shaders/drawParticlesFS.glsl";
import screenFS from "./shaders/screenFS.glsl";
import quadVS from "./shaders/quadVS.glsl";
import updatePositionFS from "./shaders/updatePositionFS.glsl";
import * as util from "./util";

const canvas = document.querySelector("#c");
const gl = canvas.getContext("webgl2", {antialias: false});


// Get A WebGL context
/** @type {HTMLCanvasElement} */
if (!gl) {
  alert("??");
}

let pxRatio = Math.max(Math.floor(window.devicePixelRatio) || 1, 2);
canvas.width = canvas.clientWidth * pxRatio;
canvas.height = canvas.clientHeight* pxRatio;
const fadeOpacity = 0.99;


const updatePositionProgram = util.createProgram(
  gl, updatePositionVS, updatePositionFS, ["newPosition"]);
const drawParticlesProgram = util.createProgram(
  gl, drawParticlesVS, drawParticlesFS);
const screenProgram = util.createProgram(gl, quadVS, screenFS);

var texture = gl.createTexture();
gl.activeTexture(gl.TEXTURE3);
gl.bindTexture(gl.TEXTURE_2D, texture);

gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
  new Uint8Array([0, 0, 255, 255]));
var image = new Image();
image.src = "fresh.jpeg";

image.addEventListener("load", function() {
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
});

const updatePositionProgLocsLocs = {
  oldPosition: gl.getAttribLocation(updatePositionProgram, "oldPosition"),
  canvasDimensions: gl.getUniformLocation(updatePositionProgram, "canvasDimensions"),
  deltaTime: gl.getUniformLocation(updatePositionProgram, "deltaTime"),
  windLookup: gl.getUniformLocation(updatePositionProgram, "windLookup"),
  jsSeed1: gl.getUniformLocation(updatePositionProgram, "jsSeed1"),
  imageSizePixels: gl.getUniformLocation(updatePositionProgram, "imageSizePixels"),
  windLookupOffset: gl.getUniformLocation(updatePositionProgram, "windLookupOffset"),
  diff: gl.getUniformLocation(updatePositionProgram, "diff"),
};

const drawParticlesProgLocs = {
  position: gl.getAttribLocation(drawParticlesProgram, "position"),
  matrix: gl.getUniformLocation(drawParticlesProgram, "matrix"),
  windLookup: gl.getUniformLocation(drawParticlesProgram, "windLookup"),
  canvasDimensions: gl.getUniformLocation(drawParticlesProgram, "canvasDimensions"),
  colorRamp: gl.getUniformLocation(drawParticlesProgram, "colorRamp"),
  imageSizePixels: gl.getUniformLocation(drawParticlesProgram, "imageSizePixels"),
  diff: gl.getUniformLocation(drawParticlesProgram, "diff"),
  windLookupOffset: gl.getUniformLocation(drawParticlesProgram, "windLookupOffset"),
  running: gl.getUniformLocation(drawParticlesProgram, "running"),
};

const screenProgLocs = {
  u_screen: gl.getUniformLocation(screenProgram, "u_screen"),
  u_opacity: gl.getUniformLocation(screenProgram, "u_opacity"),
  a_pos: gl.getAttribLocation(screenProgram, "a_pos"),
};

// we're going to base the initial positions on the size
// of the canvas so lets update the size of the canvas
// to the initial size we want
// create random positions and velocities.
const rand = (min, max) => {
  if (max === undefined) {
    max = min;
    min = 0;
  }
  return Math.random() * (max - min) + min;
};
const numParticles = 100000;
const createPoints = (num, ranges) =>
  new Array(num).fill(0).map(_ => ranges.map(range => rand(...range))).flat(); /* eslint-disable-line */
const positions = new Float32Array(createPoints(numParticles, [[canvas.width], [canvas.height]]));

let position1Buffer = util.makeBuffer(gl, positions, gl.DYNAMIC_DRAW);
let position2Buffer = util.makeBuffer(gl, positions, gl.DYNAMIC_DRAW);

const updatePositionVA1 = util.makeVertexArray(gl, position1Buffer, updatePositionProgLocsLocs.oldPosition);

const updatePositionVA2 = util.makeVertexArray(gl, position2Buffer, updatePositionProgLocsLocs.oldPosition);

const drawVA1 = util.makeVertexArray(gl, position1Buffer, drawParticlesProgLocs.position);
const drawVA2 = util.makeVertexArray(gl, position2Buffer, drawParticlesProgLocs.position);

const tf1 = util.makeTransformFeedback(gl, position1Buffer);
const tf2 = util.makeTransformFeedback(gl, position2Buffer);

let framebuffer = gl.createFramebuffer();
const emptyPixels = new Uint8Array(gl.canvas.width * gl.canvas.height * 4);
// screen textures to hold the drawn screen for the previous and the current frame
let backgroundTexture = util.createTexture(gl, gl.NEAREST, emptyPixels, gl.canvas.width, gl.canvas.height);
let screenTexture = util.createTexture(gl, gl.NEAREST, emptyPixels, gl.canvas.width, gl.canvas.height);

let current = {
  updateVA: updatePositionVA1,  // read from position1
  tf: tf2,                      // write to position2
  drawVA: drawVA2,              // draw with position2
  index: 1,
};
let next = {
  updateVA: updatePositionVA2,  // read from position2
  tf: tf1,                      // write to position1
  drawVA: drawVA1,              // draw with position1
  index: 2,
};

let then = 0;
const ramp = util.createTexture(gl, gl.LINEAR, util.getColorRamp(), 16, 16);
const quadBuffer = util.createBuffer(gl, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]));
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
  gl.uniform2f(updatePositionProgLocsLocs.canvasDimensions, gl.canvas.width, gl.canvas.height);
  gl.uniform1f(updatePositionProgLocsLocs.deltaTime, deltaTime);
  gl.uniform1i(updatePositionProgLocsLocs.windLookup, 3);
  gl.uniform1f(updatePositionProgLocsLocs.jsSeed1, Math.random());
  gl.uniform2f(updatePositionProgLocsLocs.imageSizePixels, ...imageSizePixels);
  gl.uniform2f(updatePositionProgLocsLocs.windLookupOffset, ...windLookupOffset);
  gl.uniform2f(updatePositionProgLocsLocs.diff, ...windLookup2CanvasRatio);

  gl.enable(gl.RASTERIZER_DISCARD);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, current.tf);
  gl.beginTransformFeedback(gl.POINTS);

  if (current.index === 2) {
    util.bindAndEnablePointer(gl, position2Buffer, updatePositionProgLocsLocs.oldPosition, current.updateVA);
  } else {
    util.bindAndEnablePointer(gl, position1Buffer, updatePositionProgLocsLocs.oldPosition, current.updateVA);
  }
  gl.drawArrays(gl.POINTS, 0, numParticles);
  gl.endTransformFeedback();
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

  gl.disable(gl.RASTERIZER_DISCARD);

  util.bindFramebuffer(gl, framebuffer, screenTexture);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  util.drawTexture(backgroundTexture, running ? fadeOpacity : 0.9, quadBuffer, screenProgram, gl, screenProgLocs);

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.useProgram(drawParticlesProgram);
  gl.bindVertexArray(current.drawVA);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.uniform1i(drawParticlesProgLocs.windLookup, 3);
  gl.uniform2f(drawParticlesProgLocs.canvasDimensions, gl.canvas.width, gl.canvas.height);
  gl.uniform2f(drawParticlesProgLocs.windLookupOffset, ...windLookupOffset);
  gl.uniform2f(drawParticlesProgLocs.imageSizePixels, imageSizePixels[0], imageSizePixels[1]);
  gl.uniform1i(drawParticlesProgLocs.running, running ? 1 : 0);
  gl.uniform2f(drawParticlesProgLocs.diff, ...windLookup2CanvasRatio);

  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, ramp);
  gl.uniform1i(drawParticlesProgLocs.colorRamp, 4);

  gl.uniformMatrix4fv(
    drawParticlesProgLocs.matrix,
    false,
    util.orthographic(0, gl.canvas.width, 0, gl.canvas.height, -1, 1));

  if (current.index === 1) {
    util.bindAndEnablePointer(gl, position2Buffer, drawParticlesProgLocs.position, current.drawVA);
  } else {
    util.bindAndEnablePointer(gl, position1Buffer, drawParticlesProgLocs.position, current.drawVA);
  }
  gl.drawArrays(gl.POINTS, 0, numParticles);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  util.bindFramebuffer(gl, null);
  util.drawTexture(screenTexture, 1.0, quadBuffer, screenProgram, gl, screenProgLocs);
  gl.disable(gl.BLEND);
  // swap which buffer we will read from
  // and which one we will write to
  const temp2 = current;
  current = next;
  next = temp2;

  const temp3 = backgroundTexture;
  backgroundTexture = screenTexture;
  screenTexture = temp3;
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
        'type': 'vector',
        'tiles': [
          //'https://projects.napuu.xyz/naturalearth/maps/land/{z}/{x}/{y}.pbf'
          'http://192.168.1.228:29090/maps/land/{z}/{x}/{y}.pbf'
        ],
        'minzoom': 0,
        'maxzoom': 6
      }
    },
    layers: [
      {
        "id": "water",
        "type": "background",
        "paint": {
          "background-color": "#333333"
        }
      },
      {
        'id': 'borders',
        'type': 'line',
        'source': 'land',
        'source-layer': 'land',
        'layout': {
          'line-cap': 'round',
          'line-join': 'round'
        },
        'paint': {
          'line-opacity': 1.0,
          'line-color': 'rgb(130, 130, 130)',
          'line-width': 1.5
        }
      },
    ]
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
  const mapBounds = [...proj4('EPSG:3857', [b._sw.lng, b._sw.lat]), ...proj4('EPSG:3857', [b._ne.lng, b._ne.lat])];
  windLookup2CanvasRatio = [
    (mapBounds[2] - mapBounds[0]) / imageWidthEPSG3857 * (imageSizePixels[0] / gl.canvas.width),
    (mapBounds[3] - mapBounds[1]) / imageHeightEPSG3857 * (imageSizePixels[1] / gl.canvas.height)
  ];
  windLookupOffset = [
    (mapBounds[0] - imageBboxEPSG3857[0]) / imageWidthEPSG3857 * imageSizePixels[0],
    (mapBounds[1] - imageBboxEPSG3857[1]) / imageHeightEPSG3857 * imageSizePixels[1]
  ];
}

map.on("movestart", () => {
  running = false;
})

map.on("moveend", () => {
  running = true;
  updateLayerBounds(map.getBounds());
})

map.on("load", () => {
  updateLayerBounds(map.getBounds());
  requestAnimationFrame(render);
  map.fitBounds([-28, 65, 39, 65])
})
