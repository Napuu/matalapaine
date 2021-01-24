import { Map } from "maplibre-gl";
import { h, Component, render as preactRender } from "preact";
import { useEffect, useState } from 'preact/hooks'

import htm from "htm";
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
  let imageSpecs;
  /*
  const imageSpecs = await loadWindImage(gl, "/filut/2021-01-23T13:00:00.jpeg", windTexture);
  updateProgram.uniforms.imageSizePixels = imageSpecs.size;
  drawProgram.uniforms.imageSizePixels = imageSpecs.size;
*/

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



  // Initialize htm with Preact
  const html = htm.bind(h);

  const getDefaultDate = () => {
    const t = new Date();
    t.setDate(23);
    t.setHours(t.getHours());
    //            |
    // 2021-01-23T13:00:00
    const d = t.toISOString().slice(0, 13);
    return `${d}:00:00`;
  }
  const stepDate = (date, hours) => {
    const t = new Date(date);
    t.setHours(t.getHours() + hours + 2);
    const d = t.toISOString().slice(0, 13);
    return `${d}:00:00`;
  }
  function App (props) {
    const [date, setDate] = useState(getDefaultDate())
    const incrementDate = () => {
      setDate(stepDate(date, 1));
    }
    const decrementDate = () => {
      setDate(stepDate(date, -1));
    }
    useEffect(async () => {
      console.log(date);
      imageSpecs = await loadWindImage(gl, "/filut/" + date + ".jpeg", windTexture);
      updateProgram.uniforms.imageSizePixels = imageSpecs.size;
      drawProgram.uniforms.imageSizePixels = imageSpecs.size;
      state = resetAnimation(
        gl,
        canvas,
        pxRatio,
        numParticles,
        drawProgram,
        updateProgram
      );
    }, [date])
    useEffect(async () => {
    }, []);
    return html`
    <p>
      <h1>
        ${date}
      </h1>
      <button onClick=${decrementDate}>-1</button>
      <button onClick=${incrementDate}>+1</button>
    </p>`;
  }
  preactRender(html`<${App} name="World" />`, document.querySelector("#controls"));

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
    state = resetAnimation(
      gl,
      canvas,
      pxRatio,
      numParticles,
      drawProgram,
      updateProgram
    );
    updateLayerBounds(
      gl,
      map.getBounds(),
      imageSpecs,
      updateProgram,
      drawProgram
    );
  };
})();
