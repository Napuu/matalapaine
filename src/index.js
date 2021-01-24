import { Map } from "maplibre-gl";
import {
  initPrograms,
  loadWindImage,
  updateParticles,
  drawParticles,
  drawScreen,
  drawFadedPreviousFrame,
  updateLayerBounds,
  resetAnimation,
} from "./webgl";
import * as util from "./util";

(async () => {
  const numParticles = 20000;

  // init canvas and webgl2 context
  const canvas = document.querySelector("#c");
  const gl = canvas.getContext("webgl2", { antialias: false });
  if (!gl) {
    alert("Unfortunately your browser doesn't support webgl2 :/");
  }
  const pxRatio = Math.max(Math.floor(window.devicePixelRatio) || 1, 2);
  canvas.width = canvas.clientWidth * pxRatio;
  canvas.height = canvas.clientHeight * pxRatio;

  // init webgl programs
  const { updateProgram, drawProgram, screenProgram } = initPrograms(gl);

  // load initial wind texture
  const windTexture = gl.createTexture();
  const imageSpecs = await loadWindImage(gl, "fresh.jpeg", windTexture);
  updateProgram.uniforms.imageSizePixels = imageSpecs.size;
  drawProgram.uniforms.imageSizePixels = imageSpecs.size;

  // initial state of animation
  let state = resetAnimation(
    gl,
    canvas,
    pxRatio,
    numParticles,
    drawProgram,
    updateProgram
  );

  let then = 0;

  const render = (time) => {
    if (!state.running) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clear(gl.COLOR_BUFFER_BIT);
      util.bindFramebuffer(gl, state.framebuffer, state.current.texture);
      gl.clear(gl.COLOR_BUFFER_BIT);
    } else {
      time *= 0.001;
      const deltaTime = time - then;
      then = time;

      updateProgram.uniforms.seed = Math.random();
      updateProgram.uniforms.deltaTime = deltaTime;
      updateParticles(gl, updateProgram, state, windTexture);

      drawFadedPreviousFrame(gl, screenProgram, state);

      drawParticles(gl, drawProgram, state);

      drawScreen(gl, screenProgram, state);

      // swap buffers, transformfeedbacks etc.
      const temp = state.current;
      state.current = state.next;
      state.next = temp;
    }
    requestAnimationFrame(render);
  };

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
            "http://192.168.1.37:29090/maps/land/{z}/{x}/{y}.pbf",
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

  map.on("movestart", () => {
    console.debug("movestart");
    state.running = false;
  });

  map.on("moveend", () => {
    console.debug("moveend");
    state.running = true;
    updateLayerBounds(
      gl,
      map.getBounds(),
      imageSpecs,
      updateProgram,
      drawProgram
    );
  });

  map.on("load", () => {
    updateLayerBounds(
      gl,
      map.getBounds(),
      imageSpecs,
      updateProgram,
      drawProgram
    );
    map.fitBounds([-28, 65, 39, 65]);
    requestAnimationFrame(render);
  });

  window.onresize = () => {
    console.debug("resize triggered");
    const newState = resetAnimation(
      gl,
      canvas,
      pxRatio,
      numParticles,
      drawProgram,
      updateProgram
    );
    current = newState.current;
    next = newState.next;
    updateLayerBounds(
      gl,
      map.getBounds(),
      imageSpecs,
      updateProgram,
      drawProgram
    );
  };
})();
