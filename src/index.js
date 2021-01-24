import { Map } from "maplibre-gl";
import proj4 from "proj4";
import {
  initPrograms,
  loadWindImage,
  updateParticles,
  drawParticles,
  drawScreen,
  drawFadedPreviousFrame,
  resetAnimation,
} from "./webgl";
import * as util from "./util";
(async () => {
  let running = true;

  const canvas = document.querySelector("#c");
  const gl = canvas.getContext("webgl2", { antialias: false });

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

  const windTexture = gl.createTexture();

  const imageSpecs = await loadWindImage(gl, "fresh.jpeg", windTexture);
  let imageBboxEPSG4326 = imageSpecs.bbox;
  let imageSizePixels = imageSpecs.size;
  let imageBboxEPSG3857 = [
    ...proj4("EPSG:3857", imageBboxEPSG4326.slice(0, 2)),
    ...proj4("EPSG:3857", imageBboxEPSG4326.slice(2)),
  ];
  let imageWidthEPSG3857 = imageBboxEPSG3857[2] - imageBboxEPSG3857[0];
  let imageHeightEPSG3857 = imageBboxEPSG3857[3] - imageBboxEPSG3857[1];
  updatePositionProgram.uniforms.imageSizePixels = imageSizePixels;
  drawParticlesProgram.uniforms.imageSizePixels = imageSizePixels;

  const numParticles = 20000;

  // state here contains
  // - vertex arrays for updating and drawing
  // - transformfeedbacks for updating
  // - textures for fading
  // - framebuffer for fading
  let { framebuffer, current, next } = resetAnimation(
    gl,
    canvas,
    pxRatio,
    numParticles,
    drawParticlesProgram,
    updatePositionProgram
  );

  const ramp = util.createTexture(gl, gl.LINEAR, util.getColorRamp(), 16, 16);
  const quadBuffer = util.createBuffer(
    gl,
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1])
  );

  let then = 0;
  function render(time) {
    if (!running) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clear(gl.COLOR_BUFFER_BIT);
      util.bindFramebuffer(gl, framebuffer, current.texture);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    time *= 0.001;

    const deltaTime = time - then;

    then = time;

    updatePositionProgram.uniforms.seed = Math.random();
    updatePositionProgram.uniforms.deltaTime = deltaTime;
    updateParticles(
      gl,
      updatePositionProgram,
      current,
      windTexture,
      numParticles
    );

    drawFadedPreviousFrame(
      gl,
      screenProgram,
      framebuffer,
      current,
      next,
      fadeOpacity,
      quadBuffer
    );

    drawParticles(gl, drawParticlesProgram, current, ramp, numParticles);

    drawScreen(gl, screenProgram, current, quadBuffer);

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
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    const mapBounds = [
      ...proj4("EPSG:3857", [b._sw.lng, b._sw.lat]),
      ...proj4("EPSG:3857", [b._ne.lng, b._ne.lat]),
    ];
    const windLookup2CanvasRatio = [
      ((mapBounds[2] - mapBounds[0]) / imageWidthEPSG3857) *
        (imageSizePixels[0] / gl.canvas.width),
      ((mapBounds[3] - mapBounds[1]) / imageHeightEPSG3857) *
        (imageSizePixels[1] / gl.canvas.height),
    ];
    const windLookupOffset = [
      ((mapBounds[0] - imageBboxEPSG3857[0]) / imageWidthEPSG3857) *
        imageSizePixels[0],
      ((mapBounds[1] - imageBboxEPSG3857[1]) / imageHeightEPSG3857) *
        imageSizePixels[1],
    ];
    updatePositionProgram.uniforms.diff = windLookup2CanvasRatio;
    updatePositionProgram.uniforms.windLookupOffset = windLookupOffset;
    drawParticlesProgram.uniforms.diff = windLookup2CanvasRatio;
    drawParticlesProgram.uniforms.windLookupOffset = windLookupOffset;
  };

  window.onresize = () => {
    const newState = resetAnimation(
      gl,
      canvas,
      pxRatio,
      numParticles,
      drawParticlesProgram,
      updatePositionProgram
    );
    current = newState.current;
    next = newState.next;
    framebuffer = newState.framebuffer;
    updateLayerBounds(map.getBounds());
  };

  map.on("movestart", () => {
    running = false;
  });

  map.on("moveend", () => {
    running = true;
    requestAnimationFrame(render);
    updateLayerBounds(map.getBounds());
  });

  map.on("load", () => {
    updateLayerBounds(map.getBounds());
    requestAnimationFrame(render);
    map.fitBounds([-28, 65, 39, 65]);
  });
})();
