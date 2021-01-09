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
const pixelBounds = [imgWidth, imgHeight];
const renderingSpecs = {

};
  const canvas = document.querySelector("#c");
  const gl = canvas.getContext("webgl2");
function main() {
  const quadVS = `#version 300 es
  precision highp float;

  in vec2 a_pos;

  out vec2 v_tex_pos;

  void main() {
      v_tex_pos = a_pos;
      gl_Position = vec4(1.0 - 2.0 * a_pos, 0, 1);
  }
  `;
  const screenFS = `#version 300 es
  precision highp float;

  uniform sampler2D u_screen;
  uniform float u_opacity;

  in vec2 v_tex_pos;
  out vec4 outColor;

  void main() {
      vec4 color = texture(u_screen, 1.0 - v_tex_pos);
      // a hack to guarantee opacity fade out even with a value close to 1.0
      outColor = vec4(floor(255.0 * color * u_opacity) / 255.0);
  }
  `;
  const updatePositionVS = `#version 300 es
  precision highp float;
  in vec2 oldPosition;

  uniform float deltaTime;
  uniform vec2 canvasDimensions;

  out vec2 newPosition;

  uniform sampler2D windLookup;
  uniform float jsSeed1;

  const vec3 rand_constants = vec3(12.9898, 78.233, 4375.85453);
  float rand(const vec2 co) {
      float t = dot(rand_constants.xy, co);
      return fract(sin(t) * (rand_constants.z + t));
  }

  highp float rand2(vec2 co)
  {
      highp float a = 12.9898;
      highp float b = 78.233;
      highp float c = 43758.5453;
      highp float dt= dot(co.xy ,vec2(a,b));
      highp float sn= mod(dt,3.14);
      return fract(sin(sn) * c);
  }

  float PHI = 1.61803398874989484820459;  // Φ = Golden Ratio

  float gold_noise(vec2 xy, float seed){
        return fract(tan(distance(xy*PHI, xy)*seed)*xy.x);
  }

  vec2 randPos(float seed, vec2 ll) {
      vec2 temp1 = (ll + oldPosition);
      return vec2(1.0 + gold_noise(temp1, seed) * canvasDimensions.x, 1.0 + gold_noise(temp1 + 2.4, seed) * canvasDimensions.y);
  }

  void main() {
    vec2 lookuppos = oldPosition;
    vec2 seed1 = oldPosition * jsSeed1;
    lookuppos.x /= canvasDimensions.x;
    lookuppos.y /= canvasDimensions.y;
    lookuppos.y = 1. - lookuppos.y;
    vec4 windspeed = texture(windLookup, lookuppos);
    windspeed -= 0.5;
    float windspeedmeters = length(windspeed.xy);
    float reset = step(.99 - windspeedmeters * 0.05, rand(seed1));

    windspeed *= 100.;
    vec2 temp = oldPosition + windspeed.xy * deltaTime * 5.0;
    vec2 randPos = randPos(jsSeed1, lookuppos);
    newPosition = mix(temp, randPos, reset);
  }
  `;

  const updatePositionFS = `#version 300 es
  precision highp float;
  void main() {
  }
  `;

  const drawParticlesVS = `#version 300 es
  in vec4 position;
  uniform mat4 matrix;

  uniform vec2 canvasDimensions;

  out vec4 windColor;
  uniform sampler2D windLookup;

  uniform sampler2D colorRamp;

  void main() {
    // do the common matrix math
    vec2 lookuppos = (position).xy;
    lookuppos.x /= canvasDimensions.x;
    lookuppos.y /= canvasDimensions.y;
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

    //windColor = vec4(1., 1., 0., 1.);
    gl_Position = matrix * position;
    gl_PointSize = 2.0;
  }
  `;

  const drawParticlesFS = `#version 300 es
  precision highp float;
  out vec4 outColor;
  in vec4 windColor;
  void main() {
    //outColor = vec4(1, 0, 0, 1);
    outColor = windColor;
  }
  `;

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
  function createProgram2(gl, vertexSource, fragmentSource) {
    const program = gl.createProgram();

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));

    }

    const wrapper = {program: program};

    const numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < numAttributes; i++) {
      const attribute = gl.getActiveAttrib(program, i);
      wrapper[attribute.name] = gl.getAttribLocation(program, attribute.name);

    }
    const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
      const uniform = gl.getActiveUniform(program, i);
      wrapper[uniform.name] = gl.getUniformLocation(program, uniform.name);

    }

    return wrapper;

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
    }, 200);
  });

  const updatePositionPrgLocs = {
    oldPosition: gl.getAttribLocation(updatePositionProgram, "oldPosition"),
    //velocity: gl.getAttribLocation(updatePositionProgram, 'velocity'),
    canvasDimensions: gl.getUniformLocation(updatePositionProgram, "canvasDimensions"),
    deltaTime: gl.getUniformLocation(updatePositionProgram, "deltaTime"),
    windLookup: gl.getUniformLocation(updatePositionProgram, "windLookup"),
    jsSeed1: gl.getUniformLocation(updatePositionProgram, "jsSeed1"),
  };

  const drawParticlesProgLocs = {
    position: gl.getAttribLocation(drawParticlesProgram, "position"),
    matrix: gl.getUniformLocation(drawParticlesProgram, "matrix"),
    windLookup: gl.getUniformLocation(drawParticlesProgram, "windLookup"),
    canvasDimensions: gl.getUniformLocation(drawParticlesProgram, "canvasDimensions"),
    colorRamp: gl.getUniformLocation(drawParticlesProgram, "colorRamp"),
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
  const numParticles = 50000;
  const createPoints = (num, ranges) =>
        new Array(num).fill(0).map(_ => ranges.map(range => rand(...range))).flat(); /* eslint-disable-line */
  const positions = new Float32Array(createPoints(numParticles, [[canvas.width], [canvas.height]]));

  function makeBuffer(gl, sizeOrData, usage) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, sizeOrData, usage);
    return buf;
  }

  const position1Buffer = makeBuffer(gl, positions, gl.DYNAMIC_DRAW);
  const position2Buffer = makeBuffer(gl, positions, gl.DYNAMIC_DRAW);
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
    drawTexture(backgroundTexture, fadeOpacity);
    // now draw the particles to screenTexture
    //bindFramebuffer(gl, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(drawParticlesProgram);
    gl.bindVertexArray(current.drawVA);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.uniform1i(drawParticlesProgLocs.windLookup, 3);
    gl.uniform2f(drawParticlesProgLocs.canvasDimensions, gl.canvas.width, gl.canvas.height);

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
          'https://projects.napuu.xyz/naturalearth/maps/land/{z}/{x}/{y}.pbf'
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
  //gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  let northeast = proj4('EPSG:3857', [b._ne.lng, b._ne.lat]);
  let southwest = proj4('EPSG:3857', [b._sw.lng, b._sw.lat]);
  let xM = ((northeast[0] - southwest[0]) / (imgNE3857[0] - imgSW3857[0])) * (pixelBounds[0] / gl.canvas.width);
  let yM = ((northeast[1] - southwest[1]) / (imgNE3857[1] - imgSW3857[1])) * (pixelBounds[1] / gl.canvas.height);
  console.log(xM, yM);
}

map.on("movestart", () => {
  //running = false;
})

map.on("click", (ev) => {
  console.log(ev);
    /*
  const transformed = ext2img(ev.point.x, ev.point.y);
  if (transformed.x > pixelBounds[0] || transformed.x < 0 || transformed.y > pixelBounds[1] || transformed.y < 0) {
    return {x: 0, y: 0};
  }
  const startI = Math.floor(transformed.y) * (imgWidth * 4) + Math.floor(transformed.x) * 4;
  const d = {x:(imgData[startI] - 255/2) * 50/(255 / 2), y: -((imgData[startI + 1] - 255/2)) * 50/(225 / 2)};
  console.log(Math.sqrt(d.x**2 + d.y**2));
    */
})

map.on("moveend", () => {
  //running = true;
  console.log("?? moving");
  updateLayerBounds(map.getBounds());
  //mixAmount = 1.0;
  //requestAnimationFrame(render);
})

map.on("load", () => {
  console.log("???loaded map");
//const imgSW = {lng: -42, lat: 40};
//const imgNE = {lng: 48, lat: 80};
  // w s e n
  map.fitBounds([-28, 65, 39, 65])
  //updateLayerBounds(map.getBounds());
  //requestAnimationFrame(render);
  main();
});
