import React, { useEffect, useRef, useState } from 'react';
// eslint-disable-next-line import/no-webpack-loader-syntax
import mapboxgl from "!mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import DateObject from "./Date";
import moment from "moment";

import {
  initPrograms,
  loadWindImage,
  updateParticles,
  drawScreen,
  updateLayerBounds,
  resetAnimation,
  swapBuffers as swapStates,
} from "./webgl";
import * as util from "./util";
import { useSearchParams } from 'react-router-dom';

function Map() {
  const canvasRef = useRef(null);

  const dateRef = useRef(moment().add(1, "hour"));
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsRef = useRef();

  // map and it's listeners live outside React
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const mapContainer = useRef(null);
  const map = useRef(null);
  const lng = searchParams.get("lng") || 6.582265;
  const lat = searchParams.get("lat") || 55.875950;
  const zoom = searchParams.get("zoom") || 2;

  const [date, setDate] = useState(dateRef.current);

  useEffect(() => {
    (async () => {
      dateRef.current = date;
      await loadWindImage(
        glRef.current,
        // "/debug2.jpeg",
        "/api/noaa/wind/" + dateRef.current.clone().utc().format("YYYY-MM-DDTHH:00:00"),
        windTexture.current
      );
    })();
  }, [date]);

  const glRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    glRef.current = canvas.getContext("webgl2", { antialias: false });
  }, []);

  const animationState = useRef(null);
  /*
  const drawProgram = useRef(null);
  const updateProgram = useRef(null);
  const screenProgram = useRef(null);
  */
  const windTexture = useRef(null);

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
      map.current.dragRotate.disable();
      map.current.touchZoomRotate.disableRotation();
      (async () => {
        // some features are kind of buggy with chrome/safari + webgl2
        const userAgent = window.navigator.userAgent;
        const disableBlend = userAgent.includes("Chrome") || userAgent.includes("Safari") || userAgent.includes("Mobile");
        const gl = glRef.current;
        if (!gl) {
          alert("Unfortunately your browser doesn't support webgl2 :/");
          return;
        }
        const pxRatio = Math.max(Math.floor(window.devicePixelRatio) || 1, 2);
        canvasRef.current.width = canvasRef.current.clientWidth * pxRatio;
        canvasRef.current.height = canvasRef.current.clientHeight * pxRatio;
        const particleDensity = 1.5;

        // init webgl programs
        const { updateProgram, drawProgram, screenProgram } = initPrograms(gl);

        // load initial wind texture
        windTexture.current = gl.createTexture();

        // initial state of animation
        let image = await loadWindImage(
          gl,
          "/api/noaa/wind/" + dateRef.current.clone().utc().format("YYYY-MM-DDTHH:00:00"),
          windTexture.current
        );
        updateProgram.uniforms.imageSizePixels = image.size;
        drawProgram.uniforms.imageSizePixels = image.size;
        animationState.current = resetAnimation(
          gl,
          canvasRef.current,
          pxRatio,
          particleDensity,
          drawProgram,
          updateProgram
        );
        let then = 0;
        const tick = (time) => {
          if (!animationState.current.running) {
            util.clearCanvas(gl);
          } else {
            time *= 0.001;
            const deltaTime = time - then;
            then = time;

            updateParticles(gl, updateProgram, animationState.current, windTexture.current, deltaTime);

            drawScreen(gl, screenProgram, animationState.current, disableBlend, drawProgram);

            swapStates(animationState.current);
          }
          requestAnimationFrame(tick);
        };
        const refresh = () => {
          animationState.current = resetAnimation(
            gl,
            canvasRef.current,
            pxRatio,
            (disableBlend ? 0.5 : 1) * particleDensity / Math.cbrt(map.current.getZoom()),
            drawProgram,
            updateProgram
          );
          animationState.current.running = true;
          updateLayerBounds(gl, map.current.getBounds(), image, updateProgram, drawProgram);
        };
        map.current.on("load", () => {
          updateLayerBounds(gl, map.current.getBounds(), image, updateProgram, drawProgram);
          requestAnimationFrame(tick);
          refresh();
        });
        map.current.on("movestart", () => {
          animationState.current.running = false;
        });
        map.current.on("moveend", () => {
          const center = map.current.getCenter();
          const params = new URLSearchParams(searchParamsRef.current);
          params.set("lat", center.lat.toFixed(6));
          params.set("lng", center.lng.toFixed(6));
          params.set("zoom", map.current.getZoom().toFixed(2));
          setSearchParams(params);
          refresh();
        });
      })();
    }
  });


  return (
    <div className="Map">
      <DateObject date={date} setDate={setDate} />
      <canvas style={{ left: "0px", height: "100vh", width: "100vw", position: "absolute", pointerEvents: "none", zIndex: 99 }} ref={canvasRef}></canvas>
      <div style={{ height: "100vh" }} ref={mapContainer} className="map-container" />
    </div>
  );
}

export default Map;
