import { Map } from "maplibre-gl";
import proj4 from "proj4";
const imageBboxEPSG4326 = [-42, 40, 48, 80];
const imageSizePixels = [1204, 1283];
const imageBboxEPSG3857 = [
  ...proj4('EPSG:3857', imageBboxEPSG4326.slice(0, 2)),
  ...proj4('EPSG:3857', imageBboxEPSG4326.slice(2))
];

let windLookupOffset = [], windLookup2CanvasRatio = [];
let running = true;

import updatePositionVS from "./shaders/updatePositionVS.glsl";
import drawParticlesVS from "./shaders/drawParticlesVS.glsl";
import drawParticlesFS from "./shaders/drawParticlesFS.glsl";
import screenFS from "./shaders/screenFS.glsl";
import quadVS from "./shaders/quadVS.glsl";
import updatePositionFS from "./shaders/updatePositionFS.glsl";

const canvas = document.querySelector("#c");
const gl = canvas.getContext("webgl2", {antialias: false});
function main() {

  // Get A WebGL context
  /** @type {HTMLCanvasElement} */
  if (!gl) {
    return;
  }

  function getColorRamp() {
    // ramp implementation stolen from this awesome project
    // https://github.com/mapbox/webgl-wind
    const colors = {
      0.0: "#ffffe5",
      0.1: "#fff7bc",
      0.2: "#fee391",
      0.3: "#fec44f",
      0.4: "#fe9929",
      0.5: "#ec7014",
      0.6: "#cc4c02",
      1.0: "#8c2d04"
    };
    const canvas = document.createElement("canvas");
    canvas.id = "ramp";
    const ctx = canvas.getContext("2d");
    //document.body.appendChild(canvas);

    canvas.width = 256;
    canvas.height = 1;

    const gradient = ctx.createLinearGradient(0, 0, 256, 0);
    for (const stop in colors) {
      gradient.addColorStop(stop, colors[stop]);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 1);

    return new Uint8Array(ctx.getImageData(0, 0, 256, 1).data);
  }
  const ramp = createTexture(gl, gl.LINEAR, getColorRamp(), 16, 16);

  // implementation from https://webgl2fundamentals.org/webgl/resources/m4.js
  function orthographic(left, right, bottom, top, near, far, dst) {
    dst = dst || new Float32Array(16);

    dst[ 0 ] = 2 / (right - left);
    dst[ 1 ] = 0;
    dst[ 2 ] = 0;
    dst[ 3 ] = 0;
    dst[ 4 ] = 0;
    dst[ 5 ] = 2 / (top - bottom);
    dst[ 6 ] = 0;
    dst[ 7 ] = 0;
    dst[ 8 ] = 0;
    dst[ 9 ] = 0;
    dst[10] = 2 / (near - far);
    dst[11] = 0;
    dst[12] = (left + right) / (left - right);
    dst[13] = (bottom + top) / (bottom - top);
    dst[14] = (near + far) / (near - far);
    dst[15] = 1;

    return dst;
  }

  let pxRatio = Math.max(Math.floor(window.devicePixelRatio) || 1, 2);
  canvas.width = canvas.clientWidth * pxRatio;
  canvas.height = canvas.clientHeight* pxRatio;
  const fadeOpacity = 0.99;
  function createShader(gl, type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource, transformFeedbackVaryings=undefined) {
    const program = gl.createProgram();
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    if (transformFeedbackVaryings) {
      gl.transformFeedbackVaryings(
        program,
        transformFeedbackVaryings,
        gl.SEPARATE_ATTRIBS,
      );
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramParameter(program));
    }
    return program;
  }

  const updatePositionProgram = createProgram(
    gl, updatePositionVS, updatePositionFS, ["newPosition"]);
  const drawParticlesProgram = createProgram(
    gl, drawParticlesVS, drawParticlesFS);
  const screenProgram = createProgram(gl, quadVS, screenFS);

  var texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // use texture unit 2
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 255, 255]));
  var image = new Image();
  image.src = "fresh.jpeg";
  //gl.activeTexture(gl.TEXTURE0);
  image.addEventListener("load", function() {
    setTimeout(() => {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      //gl.clear(gl.COLOR_BUFFER_BIT);
      requestAnimationFrame(render);
      //gl.activeTexture(gl.TEXTURE0);
    }, 100);
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

  function makeBuffer(gl, sizeOrData, usage) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, sizeOrData, usage);
    return buf;
  }

  let position1Buffer = makeBuffer(gl, positions, gl.DYNAMIC_DRAW);
  let position2Buffer = makeBuffer(gl, positions, gl.DYNAMIC_DRAW);

  function makeVertexArray(gl, buffer, loc) {
    const va = gl.createVertexArray();
    bindAndEnablePointer(gl, buffer, loc, va);
    return va;
  }

  function bindAndEnablePointer(gl, buffer, loc, va) {
    gl.bindVertexArray(va);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(
      loc,      // attribute location
      2,        // number of elements
      gl.FLOAT, // type of data
      false,    // normalize
      0,        // stride (0 = auto)
      0,        // offset
    );
  }

  console.log("updateposva1");
  const updatePositionVA1 = makeVertexArray(gl, position1Buffer, updatePositionProgLocsLocs.oldPosition);
  console.log("updateposva2");
  const updatePositionVA2 = makeVertexArray(gl, position2Buffer, updatePositionProgLocsLocs.oldPosition);

  function createBuffer(gl, data) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buffer;
  }
  const drawVA1 = makeVertexArray(gl, position1Buffer, drawParticlesProgLocs.position);
  const drawVA2 = makeVertexArray(gl, position2Buffer, drawParticlesProgLocs.position);

  function makeTransformFeedback(gl, buffer) {
    const tf = gl.createTransformFeedback();
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer);
    return tf;
  }

  const tf1 = makeTransformFeedback(gl, position1Buffer);
  const tf2 = makeTransformFeedback(gl, position2Buffer);

  function createTexture(gl, filter, data, width, height) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    if (data instanceof Uint8Array) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);

    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);

    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  let framebuffer = gl.createFramebuffer();
  let quadBuffer = createBuffer(gl, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]));
  const emptyPixels = new Uint8Array(gl.canvas.width * gl.canvas.height * 4);
  // screen textures to hold the drawn screen for the previous and the current frame
  let backgroundTexture = createTexture(gl, gl.NEAREST, emptyPixels, gl.canvas.width, gl.canvas.height);
  let screenTexture = createTexture(gl, gl.NEAREST, emptyPixels, gl.canvas.width, gl.canvas.height);

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

  function bindAttribute(gl, buffer, attribute, numComponents) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, numComponents, gl.FLOAT, false, 0, 0);
  }

  function bindTexture(gl, texture, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  function bindFramebuffer(gl, framebuffer, texture) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    if (texture) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    }
  }

  function drawTexture(texture, opacity) {
    const program = screenProgram;
    gl.useProgram(program);

    bindAttribute(gl, quadBuffer, screenProgLocs.a_pos, 2);
    bindTexture(gl, texture, 2);
    gl.uniform1i(screenProgLocs.u_screen, 2);
    gl.uniform1f(screenProgLocs.u_opacity, opacity);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

  }
  let then = 0;
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
      bindAndEnablePointer(gl, position2Buffer, updatePositionProgLocsLocs.oldPosition, current.updateVA);
    } else {
      bindAndEnablePointer(gl, position1Buffer, updatePositionProgLocsLocs.oldPosition, current.updateVA);
    }
    gl.drawArrays(gl.POINTS, 0, numParticles);
    gl.endTransformFeedback();
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

    gl.disable(gl.RASTERIZER_DISCARD);

    bindFramebuffer(gl, framebuffer, screenTexture);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    drawTexture(backgroundTexture, running ? fadeOpacity : 0.9);

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
      orthographic(0, gl.canvas.width, 0, gl.canvas.height, -1, 1));

    if (current.index === 1) {
      bindAndEnablePointer(gl, position2Buffer, drawParticlesProgLocs.position, current.drawVA);
    } else {
      bindAndEnablePointer(gl, position1Buffer, drawParticlesProgLocs.position, current.drawVA);
    }
    gl.drawArrays(gl.POINTS, 0, numParticles);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    bindFramebuffer(gl, null);
    drawTexture(screenTexture, 1.0);
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
  map.fitBounds([-28, 65, 39, 65])
  main();
});
