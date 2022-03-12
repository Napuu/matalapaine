import proj4 from "proj4";
export function makeBuffer(gl, sizeOrData, usage) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, sizeOrData, usage);
  return buf;
}

export function makeVertexArray(gl, buffer, loc) {
  const va = gl.createVertexArray();
  bindAndEnablePointer(gl, buffer, loc, va);
  return va;
}

export function bindAndEnablePointer(gl, buffer, loc, va) {
  gl.bindVertexArray(va);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(
    loc, // attribute location
    2, // number of elements
    gl.FLOAT, // type of data
    false, // normalize
    0, // stride (0 = auto)
    0 // offset
  );
}

export function createBuffer(gl, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

export function makeTransformFeedback(gl, buffer) {
  const tf = gl.createTransformFeedback();
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer);
  return tf;
}

export function createTexture(gl, filter, data, width, height) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  if (data instanceof Uint8Array) {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data
    );
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

export function getColorRamp() {
  // ramp implementation stolen from this awesome project
  // https://github.com/mapbox/webgl-wind
  const colors4 = {
    /*
    #ffffd9
    #edf8b1
    #c7e9b4
    #7fcdbb
    #41b6c4
    #1d91c0
    #225ea8
    #0c2c84
    */
    0.0: "#ffffd9",
    0.1: "#edf8b1",
    0.2: "#c7e9b4",
    0.3: "#7fcdbb",
    0.4: "#41b6c4",
    0.5: "#1d91c0",
    0.6: "#225ea8",
    1.0: "#0c2c84",
  };
  const canvas = document.createElement("canvas");
  canvas.id = "ramp";
  const ctx = canvas.getContext("2d");

  canvas.width = 256;
  canvas.height = 1;

  const gradient = ctx.createLinearGradient(0, 0, 256, 0);
  for (const stop in colors4) {
    gradient.addColorStop(stop, colors4[stop]);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 1);

  return { canvas, array: new Uint8Array(ctx.getImageData(0, 0, 256, 1).data) };
}

export function bindAttribute(gl, buffer, attribute, numComponents) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, numComponents, gl.FLOAT, false, 0, 0);
}

export function bindTexture(gl, texture, unit) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}

export function bindFramebuffer(gl, framebuffer, texture) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  if (texture) {
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );
  }
}

export function drawTexture(
  texture,
  opacity,
  quadBuffer,
  screenProgram,
  gl,
  screenProgLocs
) {
  const program = screenProgram;
  gl.useProgram(program);

  bindAttribute(gl, quadBuffer, screenProgLocs.attributes.a_pos, 2);
  bindTexture(gl, texture, 2);
  gl.uniform1i(screenProgLocs.uniforms.u_screen, 2);
  gl.uniform1f(screenProgLocs.uniforms.u_opacity, opacity);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// implementation from https://webgl2fundamentals.org/webgl/resources/m4.js
export function orthographic(left, right, bottom, top, near, far, dst) {
  dst = dst || new Float32Array(16);

  dst[0] = 2 / (right - left);
  dst[1] = 0;
  dst[2] = 0;
  dst[3] = 0;
  dst[4] = 0;
  dst[5] = 2 / (top - bottom);
  dst[6] = 0;
  dst[7] = 0;
  dst[8] = 0;
  dst[9] = 0;
  dst[10] = 2 / (near - far);
  dst[11] = 0;
  dst[12] = (left + right) / (left - right);
  dst[13] = (bottom + top) / (bottom - top);
  dst[14] = (near + far) / (near - far);
  dst[15] = 1;

  return dst;
}

export function createShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

export function createProgram(
  gl,
  vertexSource,
  fragmentSource,
  transformFeedbackVaryings = undefined
) {
  const program = gl.createProgram();
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  if (transformFeedbackVaryings) {
    gl.transformFeedbackVaryings(
      program,
      transformFeedbackVaryings,
      gl.SEPARATE_ATTRIBS
    );
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramParameter(program));
  }
  return program;
}

export function lookupWindspeed(drawProgram, image, map, x, y, state) {
  const b = map.getBounds();
  const imageWidthEPSG3857 = image.bbox3857[2] - image.bbox3857[0];
  const imageHeightEPSG3857 = image.bbox3857[3] - image.bbox3857[1];
  const mapBounds = [
    ...proj4("EPSG:3857", [b._sw.lng, b._sw.lat]),
    ...proj4("EPSG:3857", [b._ne.lng, b._ne.lat]),
  ];
  const windLookupOffset = [
    ((mapBounds[0] - image.bbox3857[0]) / imageWidthEPSG3857) * image.size[0],
    ((image.bbox3857[3] - mapBounds[3]) / imageHeightEPSG3857) * image.size[1],
  ];
  const sx =
    x * state.pxRatio * drawProgram.uniforms.windLookup2CanvasRatio[0] +
    drawProgram.uniforms.windLookupOffset[0];
  const sy =
    y * state.pxRatio * drawProgram.uniforms.windLookup2CanvasRatio[0] +
    windLookupOffset[1];
  let windspeedMeters;
  if (sx < 0 || sx > image.size[0] || sy < 0 || sy > image.size[1]) {
    // nothing to show
  } else {
    const startI = Math.floor(sy) * (image.size[0] * 4) + Math.floor(sx) * 4;
    const d = {
      x: image.data[startI] - 255 / 2,
      y: image.data[startI + 1] - 255 / 2,
    };
    windspeedMeters = Math.round(
      Math.sqrt(Math.pow(d.x / 2.55, 2) + Math.pow(d.y / 2.55, 2))
    );
  }
  return windspeedMeters;
}

export function clearCanvas(gl) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

export function debounce(func, timeout = 400) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
}