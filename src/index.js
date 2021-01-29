import { Map } from "maplibre-gl";
import { h, Component, render as preactRender } from "preact";
import { useEffect, useState } from 'preact/hooks'
import proj4 from "proj4";

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
  const numParticles = 60000;

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
  let image;
  /*
  const image = await loadWindImage(gl, "/filut/2021-01-23T13:00:00.jpeg", windTexture);
  updateProgram.uniforms.imageSizePixels = image.size;
  drawProgram.uniforms.imageSizePixels = image.size;
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

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      drawScreen(gl, screenProgram, state);
      gl.disable(gl.BLEND);

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
    t.setHours(t.getHours() + 3);
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
    const prettifyDate = (_date) => {
      const date = new Date(_date);
      const padStart = (a) => a.toString().padStart(2, "0");
      return `${padStart(date.getDate())}.${padStart(date.getMonth()+1)}.${date.getFullYear()} ${padStart(date.getHours())}:${padStart(date.getMinutes())}:00`;
    }
    useEffect(async () => {
      console.log(date);
      image = await loadWindImage(gl, "/filut/" + date + ".jpeg", windTexture);
      updateProgram.uniforms.imageSizePixels = image.size;
      drawProgram.uniforms.imageSizePixels = image.size;
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
        ${prettifyDate(date)}
      </h1>
      <button onClick=${decrementDate}>-1h</button>
      <button onClick=${incrementDate}>+1h</button>
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
            'https://projects.napuu.xyz/tiles/maps/land/{z}/{x}/{y}.pbf'
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
            "line-color": "rgb(170, 170, 170)",
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
      image,
      updateProgram,
      drawProgram
    );
  });

  map.on("load", () => {
    updateLayerBounds(
      gl,
      map.getBounds(),
      image,
      updateProgram,
      drawProgram
    );
    map.fitBounds([-28, 65, 39, 65]);
    requestAnimationFrame(render);
  });

  map.on("click", (e) => {
    console.debug(e);
    const x = e.point.x;
    const y = e.point.y;
    console.log(x, y);

    console.log(drawProgram.uniforms.windLookup2CanvasRatio);
    const t = (drawProgram.uniforms.windLookupOffset);
    const b = map.getBounds();
  const imageWidthEPSG3857 = image.bbox3857[2] - image.bbox3857[0];
  const imageHeightEPSG3857 = image.bbox3857[3] - image.bbox3857[1];
  const mapBounds = [
    ...proj4("EPSG:3857", [b._sw.lng, b._sw.lat]),
    ...proj4("EPSG:3857", [b._ne.lng, b._ne.lat]),
  ];
  const windLookup2CanvasRatio = [
    ((mapBounds[2] - mapBounds[0]) / imageWidthEPSG3857) *
      (image.size[0] / gl.canvas.width),
    ((mapBounds[3] - mapBounds[1]) / imageHeightEPSG3857) *
      (image.size[1] / gl.canvas.height),
  ];
  const windLookupOffset = [
    ((mapBounds[0] - image.bbox3857[0]) / imageWidthEPSG3857) *
      image.size[0],
    //((mapBounds[1] - image.bbox3857[1]) / imageHeightEPSG3857) *
    ((image.bbox3857[3] - mapBounds[3]) / imageHeightEPSG3857) *
      image.size[1],
  ];
    const sx = x + drawProgram.uniforms.windLookup2CanvasRatio[0] * drawProgram.uniforms.windLookupOffset[0];
    console.log(sx);
    console.log(windLookupOffset); // these are now fixed for js side canvas lookup
    //TODO this
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
      image,
      updateProgram,
      drawProgram
    );
  };
})();
