import React, { useCallback, useEffect, useRef, useState } from 'react';
// eslint-disable-next-line import/no-webpack-loader-syntax
import mapboxgl from "!mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import DateObject from "./Date";
import moment from "moment";
import { useQueryClient } from "react-query";

import {
  initPrograms,
  loadWindImage,
  updateParticles,
  drawScreen,
  updateLayerBounds,
  resetAnimation,
} from "./webgl";
import * as util from "./util";
import { useSearchParams } from 'react-router-dom';

function Map() {
  const canvasRef = useRef(null);
  const [canvasLoaded, setCanvasLoaded] = useState(false);

  const dateRef = useRef(null);
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
  const zoom = searchParams.get("zoom") || 4;

  const glRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    glRef.current = canvas.getContext("webgl2", { antialias: false });
  }, []);

  const [animationDate, setAnimationDate] = useState(null);

  const animationState = useRef(null);
  const drawProgram = useRef(null);
  const updateProgram = useRef(null);
  const screenProgram = useRef(null);
  const windTexture = useRef(null);

  useEffect(() => {

  }, [animationDate]);

  useEffect(() => {
    if (!map.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/palikk/cl0i0f7er000114nuxzu3s5z2',
        center: [lng, lat],
        disableTouchZoom: true,
        dragRotate: false,
        touchZoomRotate: false,
        minZoom: 1,
        // accessToken: process.env.REACT_APP_MAPBOX_TOKEN,
        accessToken: "pk.eyJ1IjoicGFsaWtrIiwiYSI6ImNsMGh4NGt4ZjA5dmwzY3Vlc2RlMXNxOWoifQ.wlVg2AX9pAVRUexfrSEH-A",
        zoom: zoom,
        renderWorldCopies: false,
      });
      (async () => {
        // some features are kind of buggy with chrome/safari + webgl2
        const userAgent = window.navigator.userAgent;
        const disableBlend = userAgent.includes("Chrome") || userAgent.includes("Safari");
        setCanvasLoaded(true);
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

        const date = moment().add(1, "hour");
        dateRef.current = date;
        // initial state of animation
        let image = await loadWindImage(
          gl,
          "/api/noaa/wind/" + date.clone().utc().format("YYYY-MM-DDTHH:00:00"),
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
        const render = (time) => {
          if (!animationState.current.running) {
            util.clearCanvas(gl);
          } else {
            //actualRender(time, then, updateProgram, screenProgram, drawProgram, windTexture.current, gl, animationState.current, disableBlend);
            
            time *= 0.001;
            const deltaTime = time - then;
            then = time;

            updateProgram.uniforms.seed = Math.random();
            updateProgram.uniforms.deltaTime = deltaTime;
            updateParticles(gl, updateProgram, animationState.current, windTexture.current);

            drawScreen(gl, screenProgram, animationState.current, disableBlend, drawProgram);

            // swap buffers, transformfeedbacks etc.
            const temp = animationState.current.current;
            animationState.current.current = animationState.current.next;
            animationState.current.next = temp;
          }
          requestAnimationFrame(render);
        };
        const refresh = () => {
          animationState.current= resetAnimation(
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
          console.log("loaded");
          updateLayerBounds(gl, map.current.getBounds(), image, updateProgram, drawProgram);
          requestAnimationFrame(render);
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
      <DateObject date={dateRef.current} />
      <canvas style={{ left: "0px", height: "100vh", width: "100vw", position: "absolute", pointerEvents: "none", zIndex: 99 }} ref={canvasRef}></canvas>
      <div style={{ height: "100vh" }} ref={mapContainer} className="map-container" />
    </div>
  );
}

export default Map;
