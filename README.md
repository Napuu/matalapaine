# weather-dashboard-front

Visualization of Northern Europe wind conditions. https://matalapaine.fi

Frontend stack consisting of WebGL2, React (Preact), MapLibre JS (Fork of Mapbox GL JS).

At backend Go, GDAL and some bash scripts are used to fetch data from Finnish Meteorology Institute and process it from GRIB file to jpeg.

Backgroud map tiles are hosted at Tegola+Postgis. Data from https://www.naturalearthdata.com/

#### dev

Change line `image.src = imgSrc"` to `image.src = "fresh.jpeg"` at `src/webgl.js` to use local version of wind conditions. After that:
```
npm i
npm run dev
```
and navigate to `http://localhost:5000`
