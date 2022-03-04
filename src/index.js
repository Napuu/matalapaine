import { Map, Popup } from "maplibre-gl";
import { h, Component, render as preactRender } from "preact";
import { useEffect, useState } from "preact/hooks";
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
  // some features are kind of buggy with chrome + webgl2
  const isChrome = window.navigator.userAgent.includes("Chrome");

  // init canvas and webgl2 context
  const canvas = document.querySelector("#c");
  const gl = canvas.getContext("webgl2", { antialias: false });
  if (!gl) {
    alert("Unfortunately your browser doesn't support webgl2 :/");
    return;
  }
  const pxRatio = Math.max(Math.floor(window.devicePixelRatio) || 1, 2);
  canvas.width = canvas.clientWidth * pxRatio;
  canvas.height = canvas.clientHeight * pxRatio;
  const particleDensity = 1.5;

  // init webgl programs
  const { updateProgram, drawProgram, screenProgram } = initPrograms(gl);

  // load initial wind texture
  const windTexture = gl.createTexture();
  let image;

  // initial state of animation
  let state = resetAnimation(
    gl,
    canvas,
    pxRatio,
    particleDensity,
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

      // combination of chrome, webgl2 and blend seems to be kind of buggy
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

  // Ui stuff, Preact definitely wasn't needed here, but wanted to try it :-)
  const html = htm.bind(h);
  const getDefaultDate = () => {
    const t = new Date();
    t.setHours(t.getHours() + 1);
    const d = t.toISOString().slice(0, 13);
    return `${d}:00:00`;
  };
  const stepDate = (date, hours) => {
    const t = new Date(date);
    const timezoneOffsetHours = t.getTimezoneOffset() / 60;
    t.setHours(t.getHours() + hours - timezoneOffsetHours);

    const diffHours = Math.abs(new Date() - t) / 3600000;
    let d = t.toISOString().slice(0, 13);
    if (diffHours > 6) {
      alert("Only ±6h available");
      const original = new Date(date);
      original.setHours(original.getHours() - timezoneOffsetHours);
      d = original.toISOString().slice(0, 13);
    }
    // ISO string with hours and minutes set to 0
    return `${d}:00:00`;
  };
  let popup = { element: new Popup({ closeOnClick: true }), lngLat: null };
  const updatePopup = (popup) => {
    if (popup.lngLat) {
      const point = map.project(popup.lngLat);
      const windspeedMeters = util.lookupWindspeed(
        drawProgram,
        image,
        map,
        point.x,
        point.y,
        state
      );
      popup.element.setHTML(windspeedMeters + " m/s");
    }
  };
  function App(props) {
    const [date, setDate] = useState(getDefaultDate());
    const [infoVisibility, setInfoVisibility] = useState("hidden");
    const toggleInfoVisibility = () => {
      if (infoVisibility === "hidden") {
        setInfoVisibility("initial");
      } else {
        setInfoVisibility("hidden");
      }
    };
    const incrementDate = () => {
      setDate(stepDate(date, 1));
      util.debounce(() => {
        updatePopup(popup);
      })();
    };
    const decrementDate = () => {
      setDate(stepDate(date, -1));
      util.debounce(() => {
        updatePopup(popup);
      })();
    };
    const prettifyDate = (_date) => {
      const date = new Date(_date);
      date.setHours(date.getHours() - date.getTimezoneOffset() / 60);
      const padStart = (a) => a.toString().padStart(2, "0");
      return `${padStart(date.getHours())}:${padStart(
        date.getMinutes()
      )}:00 ${padStart(date.getDate())}.${padStart(
        date.getMonth() + 1
      )}.${date.getFullYear()}`;
    };
    useEffect(async () => {
      image = await loadWindImage(
        gl,
        // there is now noaa twice in the url :D
        `/api/noaa/${date}Z_noaa_wind.jpeg`,
        windTexture
      );
      updateProgram.uniforms.imageSizePixels = image.size;
      drawProgram.uniforms.imageSizePixels = image.size;
      state = resetAnimation(
        gl,
        canvas,
        pxRatio,
        particleDensity,
        drawProgram,
        updateProgram
      );
    }, [date]);

    return html`<div class="controls">
      <div id="date">${prettifyDate(date)}</div>
      <button onClick=${decrementDate}>-1h</button>
      <button onClick=${incrementDate}>+1h</button>
      <div
        id="info"
        onClick=${() => {
          toggleInfoVisibility("initial");
        }}
      >
        i
      </div>
      <div style="visibility: ${infoVisibility}" id="info-popup">
        Santeri Kääriäinen ${"<santeri.kaariainen@iki.fi>"}
        <br /><a href="https://github.com/Napuu/weather-dashboard-front"
          >github.com</a
        >
      </div>
    </div>`;
  }
  preactRender(
    html`<${App} name="World" />`,
    document.querySelector("#controls")
  );

  const map = new Map({
    container: "map",
    pitchWithRotate: false,
    dragRotate: false,
    maxBounds: [[-180, -90], [180, 90]],
    style: {
      version: 8,
      sources: {
        land: {
          type: "vector",
          tiles: ["https://matalapaine.fi/tiles/maps/land/{z}/{x}/{y}.pbf"],
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
            "line-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              0.8,
              14,
              1.0,
            ],
            "line-color": "rgb(170, 170, 170)",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              0.7,
              14,
              1.9,
            ]
          },
        },
      ],
    },
    center: [8, 63],
    zoom: 4,
    minZoom: 2,
  });

  map.touchZoomRotate.disableRotation();

  // making sure popup is not opened twice with
  // double clicks or at all when moving
  let clickedRecently = false;
  map.on("movestart", () => {
    clickedRecently = false;
    console.debug("movestart");
    state.running = false;
  });

  map.on("moveend", () => {
    console.debug("moveend");
    state.running = true;
    if (popup.lngLat) {
      const point = map.project(popup.lngLat);
      if (
        point.x < 0 ||
        point.x > canvas.width / pxRatio ||
        point.y < 0 ||
        point.y > canvas.height / pxRatio
      ) {
        popup.element.remove();
      }
    }
    updateLayerBounds(gl, map.getBounds(), image, updateProgram, drawProgram);
  });

  map.on("load", () => {
    updateLayerBounds(gl, map.getBounds(), image, updateProgram, drawProgram);
    map.fitBounds([-28, 65, 39, 65]);
    requestAnimationFrame(render);
  });

  map.on("click", (e) => {
    clickedRecently = true;
    util.debounce(() => {
      if (!clickedRecently) return;
      const windspeedMeters = util.lookupWindspeed(
        drawProgram,
        image,
        map,
        e.point.x,
        e.point.y,
        state
      );
      if (windspeedMeters !== undefined) {
        popup.element = new Popup({ closeOnClick: true })
          .setLngLat(e.lngLat)
          .setHTML(windspeedMeters + " m/s")
          .addTo(map);
        popup.lngLat = e.lngLat;
        // ugly way to insert popup on top of my wind animation
        const el = document.querySelector(".mapboxgl-popup");
        document.querySelector("#popup-container").appendChild(el);
      }
      clickedRecently = false;
    })();
  });

  window.onresize = () => {
    console.debug("resize triggered");
    state = resetAnimation(
      gl,
      canvas,
      pxRatio,
      particleDensity,
      drawProgram,
      updateProgram
    );
    updateLayerBounds(gl, map.getBounds(), image, updateProgram, drawProgram);
  };
})();
