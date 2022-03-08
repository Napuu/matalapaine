import React, { useEffect, useRef, useState } from 'react';
// eslint-disable-next-line import/no-webpack-loader-syntax
import mapboxgl from "!mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

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

function App() {
  const canvasRef = useRef(null);
  const [canvasLoaded, setCanvasLoaded] = useState(false);

  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng, setLng] = useState(6.582265);
  const [lat, setLat] = useState(55.875950);
  const [zoom, setZoom] = useState(2);
  useEffect(() => {
    if (!map.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/palikk/cl0i0f7er000114nuxzu3s5z2',
        center: [lng, lat],
        minZoom: 1,
        // accessToken: process.env.REACT_APP_MAPBOX_TOKEN,
        accessToken: "pk.eyJ1IjoicGFsaWtrIiwiYSI6ImNsMGh4NGt4ZjA5dmwzY3Vlc2RlMXNxOWoifQ.wlVg2AX9pAVRUexfrSEH-A",
        zoom: zoom,
        renderWorldCopies: false,
      });
      map.current.on("moveend", () => {
        const center = map.current.getCenter();
        setLat(center.lat);
        setLng(center.lng);
        setZoom(map.current.getZoom());
      });
    }
    if (!canvasLoaded) {
      (async () => {
        setCanvasLoaded(true);
        const canvas = canvasRef.current;
        const gl = canvas.getContext("webgl2", { antialias: false });
        console.log("haloo");
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

        const date = new Date();
        date.setMinutes(0);
        date.setSeconds(0);
        // initial state of animation
        let image = await loadWindImage(
          gl,
          "/api/noaa/wind/" + date.toISOString().slice(0, 19),
          windTexture
        );
        updateProgram.uniforms.imageSizePixels = image.size;
        drawProgram.uniforms.imageSizePixels = image.size;
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
        map.current.on("load", () => {
          updateLayerBounds(gl, map.current.getBounds(), image, updateProgram, drawProgram);
          map.current.fitBounds([-28, 65, 39, 65]);
          requestAnimationFrame(render);
        });
        map.current.on("movestart", () => {
          state.running = false;
        });
        map.current.on("moveend", () => {
          console.debug("moveend");
          state = resetAnimation(
            gl,
            canvas,
            pxRatio,
            particleDensity / Math.cbrt(map.current.getZoom()),
            drawProgram,
            updateProgram
          );
          state.running = true;
          updateLayerBounds(gl, map.current.getBounds(), image, updateProgram, drawProgram);
        });
      })();
    }
  });


  return (
    <div className="App">
      <canvas style={{ left: "0px", height: "100vh", width: "100vw", position: "absolute", pointerEvents: "none", zIndex: 99 }} ref={canvasRef}></canvas>
      <div style={{ height: "100vh" }} ref={mapContainer} className="map-container" />
    </div>
  );
}

export default App;
