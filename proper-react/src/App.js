import logo from './logo.svg';
import './App.css';
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from "mapbox-gl";
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

function App() {

  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng, setLng] = useState(6.582265);
  const [lat, setLat] = useState(55.875950);
  const [zoom, setZoom] = useState(2);
  useEffect(() => {
    if (map.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/palikk/cl0hxdo0b003614qka54axxaa',
      center: [lng, lat],
      accessToken: process.env.REACT_APP_MAPBOX_TOKEN,
      zoom: zoom
    });
    map.current.on("moveend", () => {
      const center = map.current.getCenter();
      setLat(center.lat);
      setLng(center.lng);
      setZoom(map.current.getZoom());
    });
  });
  return (
    <div className="App">
      <canvas id="c"></canvas>
      <div style={{height: "100vh"}} ref={mapContainer} className="map-container" />
    </div>
  );
}

export default App;
