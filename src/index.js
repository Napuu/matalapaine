import {Map} from "maplibre-gl";
import proj4 from "proj4";
const imgSW = {lng: -42, lat: 40};
const imgSW3857 = proj4('EPSG:3857', [imgSW.lng, imgSW.lat]);
//const imgNE = {lng: 34.5420283, lat: 74.0060376};
const imgNE = {lng: 48, lat: 80};
const imgNE3857 = proj4('EPSG:3857', [imgNE.lng, imgNE.lat]);
//const imgWidth = 1254;
const imgWidth = 1204;
//const imgHeight = 1790;
const imgHeight = 1283;
let northeast, southwest, xM, yM;
const pixelBounds = [imgWidth, imgHeight];
console.log("pixelbounds", pixelBounds);
let running = true;
import updatePositionVS from "./shaders/updatePositionVS.glsl";
import drawParticlesVS from "./shaders/drawParticlesVS.glsl";
import drawParticlesFS from "./shaders/drawParticlesFS.glsl";
import screenFS from "./shaders/screenFS.glsl";
import quadVS from "./shaders/quadVS.glsl";
import updatePositionFS from "./shaders/updatePositionFS.glsl";
const renderingSpecs = {

};
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
  //pxRatio = 1;
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
    }, 2000);
  });

  const updatePositionPrgLocs = {
    oldPosition: gl.getAttribLocation(updatePositionProgram, "oldPosition"),
    //velocity: gl.getAttribLocation(updatePositionProgram, 'velocity'),
    canvasDimensions: gl.getUniformLocation(updatePositionProgram, "canvasDimensions"),
    deltaTime: gl.getUniformLocation(updatePositionProgram, "deltaTime"),
    windLookup: gl.getUniformLocation(updatePositionProgram, "windLookup"),
    jsSeed1: gl.getUniformLocation(updatePositionProgram, "jsSeed1"),
    southwest: gl.getUniformLocation(updatePositionProgram, "southwest"),
    northeast: gl.getUniformLocation(updatePositionProgram, "northeast"),
    imgSW3857: gl.getUniformLocation(updatePositionProgram, "imgSW3857"),
    imgNE3857: gl.getUniformLocation(updatePositionProgram, "imgNE3857"),
    pixelBounds: gl.getUniformLocation(updatePositionProgram, "pixelBounds"),
    diff: gl.getUniformLocation(updatePositionProgram, "diff"),
  };

  const drawParticlesProgLocs = {
    position: gl.getAttribLocation(drawParticlesProgram, "position"),
    matrix: gl.getUniformLocation(drawParticlesProgram, "matrix"),
    windLookup: gl.getUniformLocation(drawParticlesProgram, "windLookup"),
    canvasDimensions: gl.getUniformLocation(drawParticlesProgram, "canvasDimensions"),
    colorRamp: gl.getUniformLocation(drawParticlesProgram, "colorRamp"),
    southwest: gl.getUniformLocation(drawParticlesProgram, "southwest"),
    northeast: gl.getUniformLocation(drawParticlesProgram, "northeast"),
    imgSW3857: gl.getUniformLocation(drawParticlesProgram, "imgSW3857"),
    imgNE3857: gl.getUniformLocation(drawParticlesProgram, "imgNE3857"),
    pixelBounds: gl.getUniformLocation(drawParticlesProgram, "pixelBounds"),
    diff: gl.getUniformLocation(drawParticlesProgram, "diff"),
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
  //const velocityBuffer = makeBuffer(gl, velocities, gl.STATIC_DRAW);

  function makeVertexArray(gl, bufLocPairs, _va=undefined) {
    let va;
    if (!_va) va = gl.createVertexArray();
    else va = _va;
    gl.bindVertexArray(va);
    for (const [buffer, loc] of bufLocPairs) {
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
    return va;
  }

  console.log("updateposva1");
  const updatePositionVA1 = makeVertexArray(gl, [
    [position1Buffer, updatePositionPrgLocs.oldPosition],
  ]);
  console.log("updateposva2");
  const updatePositionVA2 = makeVertexArray(gl, [
    [position2Buffer, updatePositionPrgLocs.oldPosition],
  ]);

  function createBuffer(gl, data) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buffer;
  }
  const drawVA1 = makeVertexArray(
    gl, [[position1Buffer, drawParticlesProgLocs.position]]);
  const drawVA2 = makeVertexArray(
    gl, [[position2Buffer, drawParticlesProgLocs.position]]);

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
    //stats.begin();
    // TODO test if these actually improve performance
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    time *= 0.001;
    // Subtract the previous time from the current time
    const deltaTime = time - then;
    // Remember the current time for the next frame.
    then = time;

    //webglUtils.resizeCanvasToDisplaySize(gl.canvas);

    // compute the new positions
    gl.useProgram(updatePositionProgram);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.bindVertexArray(current.updateVA);
    gl.uniform2f(updatePositionPrgLocs.canvasDimensions, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(updatePositionPrgLocs.deltaTime, deltaTime);
    gl.uniform1i(updatePositionPrgLocs.windLookup, 3);
    gl.uniform1f(updatePositionPrgLocs.jsSeed1, Math.random());
    gl.uniform2f(updatePositionPrgLocs.southwest, southwest[0], southwest[1]);
    gl.uniform2f(updatePositionPrgLocs.northeast, northeast[0], northeast[1]);
    gl.uniform2f(updatePositionPrgLocs.imgSW3857, imgSW3857[0], imgSW3857[1]);
    gl.uniform2f(updatePositionPrgLocs.imgNE3857, imgNE3857[0], imgNE3857[1]);
    gl.uniform2f(updatePositionPrgLocs.pixelBounds, pixelBounds[0], pixelBounds[1]);
    gl.uniform2f(updatePositionPrgLocs.diff, xM, yM);
    /*
  uniform vec2 southwest;
  uniform vec2 imgSW3857;
  uniform vec2 imgNE3857;
  uniform vec2 northeast;
  uniform vec2 pixelBounds;
  */
    //gl.uniform1f(updatePositionPrgLocs.windLookup, texture);

    gl.enable(gl.RASTERIZER_DISCARD);

    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, current.tf);
    gl.beginTransformFeedback(gl.POINTS);
    //gl.bindBuffer(gl.ARRAY_BUFFER, null);
    //gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
    if (current.index === 2) {
      makeVertexArray(gl, [[position2Buffer, updatePositionPrgLocs.oldPosition]], current.updateVA);
    } else {
      makeVertexArray(gl, [[position1Buffer, updatePositionPrgLocs.oldPosition]], current.updateVA);
    }
    gl.drawArrays(gl.POINTS, 0, numParticles);
    gl.endTransformFeedback();
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

    // turn on using fragment shaders again
    gl.disable(gl.RASTERIZER_DISCARD);

    bindFramebuffer(gl, framebuffer, screenTexture);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    drawTexture(backgroundTexture, running ? fadeOpacity : 0.9);
    // now draw the particles to screenTexture
    //bindFramebuffer(gl, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(drawParticlesProgram);
    gl.bindVertexArray(current.drawVA);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.uniform1i(drawParticlesProgLocs.windLookup, 3);
    gl.uniform2f(drawParticlesProgLocs.canvasDimensions, gl.canvas.width, gl.canvas.height);
    gl.uniform2f(drawParticlesProgLocs.southwest, southwest[0], southwest[1]);
    gl.uniform2f(drawParticlesProgLocs.northeast, northeast[0], northeast[1]);
    gl.uniform2f(drawParticlesProgLocs.imgSW3857, imgSW3857[0], imgSW3857[1]);
    gl.uniform2f(drawParticlesProgLocs.imgNE3857, imgNE3857[0], imgNE3857[1]);
    gl.uniform2f(drawParticlesProgLocs.pixelBounds, pixelBounds[0], pixelBounds[1]);
    gl.uniform1i(drawParticlesProgLocs.running, running ? 1 : 0);
    gl.uniform2f(drawParticlesProgLocs.diff, xM, yM);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, ramp);
    gl.uniform1i(drawParticlesProgLocs.colorRamp, 4);

    gl.uniformMatrix4fv(
      drawParticlesProgLocs.matrix,
      false,
      orthographic(0, gl.canvas.width, 0, gl.canvas.height, -1, 1));
    if (current.index === 1) {
      makeVertexArray(gl, [[position2Buffer, drawParticlesProgLocs.position]], current.drawVA);
    } else {
      makeVertexArray(gl, [[position1Buffer, drawParticlesProgLocs.position]], current.drawVA);
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
    //stats.end();
    requestAnimationFrame(render);
  }
  //requestAnimationFrame(render);
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
const ext2img = (x, y) => {
  if (!xM) return {x,y};
  const x0 = Math.floor(((southwest[0] - imgSW3857[0]) / (imgNE3857[0] - imgSW3857[0])) * pixelBounds[0]);
  const y0 = Math.floor(((imgNE3857[1] - northeast[1]) / (imgNE3857[1] - imgSW3857[1])) * pixelBounds[1]);
  return {x:Math.floor(x*xM + x0), y: Math.floor(y*yM + y0)};
}
const updateLayerBounds = (b) => {
  /*
  if (resizeCanvasToDisplaySize(gl.canvas, pxRatio)) {
    resizeFramebufferInfo(gl, fadeFbi1, fadeAttachments);
    resizeFramebufferInfo(gl, fadeFbi2, fadeAttachments);
  }
  */
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  northeast = proj4('EPSG:3857', [b._ne.lng, b._ne.lat]);
  southwest = proj4('EPSG:3857', [b._sw.lng, b._sw.lat]);
  xM = ((northeast[0] - southwest[0]) / (imgNE3857[0] - imgSW3857[0])) * (pixelBounds[0] / gl.canvas.width);
  yM = ((northeast[1] - southwest[1]) / (imgNE3857[1] - imgSW3857[1])) * (pixelBounds[1] / gl.canvas.height);
  console.log(xM, yM);
  console.log(northeast, southwest);
  console.log("ext2img of (0, 0)", ext2img(0, 0));
}

map.on("movestart", () => {
  running = false;
})

map.on("moveend", () => {
  running = true;
  console.log("?? moving");
  updateLayerBounds(map.getBounds());
  //position1Buffer = makeBuffer(gl, positions, gl.DYNAMIC_DRAW);
  //position2Buffer = makeBuffer(gl, positions, gl.DYNAMIC_DRAW);
})

map.on("load", () => {
  map.fitBounds([-28, 65, 39, 65])
  main();
});
