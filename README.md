# weather-dashboard-front

Visualization of Northern Europe wind conditions. https://matalapaine.fi

![preview](public/preview.jpg?raw=true)

Frontend stack consisting of WebGL2, React (Preact), MapLibre JS (Fork of Mapbox GL JS).  
I wanted to use WebGL2 as it had some useful new features, mainly possibility to keep particle state at traditional buffers via transform feedbacks instead of using fairly common "hack" where particle state is encoded to and decoded from texture. (Like for example at this nice project https://github.com/mapbox/webgl-wind)  
On the downside iOS or Safari don't support WebGL2 right now.

At backend Go, GDAL and some bash scripts are used to fetch data from Finnish Meteorology Institute and process it from GRIB files to jpeg.

Backgroud map tiles are hosted at Tegola+Postgis. Data from https://www.naturalearthdata.com/

## dev

Change line `image.src = "imgSrc"` to `image.src = "fresh.jpeg"` at `src/webgl.js` to use local version of wind conditions. After that:
```
npm i
npm run dev
```
and navigate to `http://localhost:5000`
