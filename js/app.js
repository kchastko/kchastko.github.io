import { $, $$, to24HourFormat, formatRangeLabel, toDateInputFormat } from './helpers.js';
import { center, hereCredentials } from './config.js';
import { isolineMaxRange, requestIsolineShape } from './here.js';
import HourFilter from './HourFilter.js';
import MapRotation from './MapRotation.js';
import Search from './Search.js';

//Height calculations
const height = $('#content-group-1').clientHeight || $('#content-group-1').offsetHeight;
$('.content').style.height = height + 'px';

//Manage initial state
$('#slider-val').innerText = formatRangeLabel($('#range').value, 'time');
$('#date-value').value = toDateInputFormat(new Date());

//Add event listeners
$$('.isoline-controls').forEach(c => c.onchange = () => calculateIsoline());
$$('.view-controls').forEach(c => c.onchange = () => calculateView());

//Tab control for sidebar
const tabs = $$('.tab');
tabs.forEach(t => t.onclick = tabify)
function tabify(evt) {
   tabs.forEach(t => t.classList.remove('tab-active'));
   if (evt.target.id === 'tab-1') {
      $('.tab-bar').style.transform = 'translateX(0)';
      evt.target.classList.add('tab-active');
      $('#content-group-1').style.transform = 'translateX(0)';
      $('#content-group-2').style.transform = 'translateX(100%)';
   } else {
      $('.tab-bar').style.transform = 'translateX(100%)';
      evt.target.classList.add('tab-active');
      $('#content-group-1').style.transform = 'translateX(-100%)';
      $('#content-group-2').style.transform = 'translateX(0)';
   }
}

//Theme control
const themeTiles = $$('.theme-tile');
themeTiles.forEach(t => t.onclick = tabifyThemes);
function tabifyThemes(evt) {
   themeTiles.forEach(t => t.classList.remove('theme-tile-active'));
   evt.target.classList.add('theme-tile-active');
   if (evt.target.id === 'day') {
      const style = new H.map.Style('https://js.api.here.com/v3/3.1/styles/omv/normal.day.yaml')
      //const style = new H.map.Style('./resources/scene.yaml')
      provider.setStyle(style);
   } else {
      const style = new H.map.Style('./resources/night.yaml');
      provider.setStyle(style);
   }
}

// Initialize HERE Map
const platform = new H.service.Platform({ apikey: hereCredentials.apikey });
const defaultLayers = platform.createDefaultLayers();
const map = new H.Map(document.getElementById('map'),       defaultLayers.vector.normal.map, {
   center,
   zoom: 12,
   pixelRatio: window.devicePixelRatio || 1
});
//const events = new H.mapevents.MapEvents(map);
const behavior = new H.mapevents.Behavior(new H.mapevents.MapEvents(map));
const provider = map.getBaseLayer().getProvider();


//Initialize router and geocoder
const router = platform.getRoutingService();
const geocoder = platform.getGeocodingService();

window.addEventListener('resize', () => map.getViewPort().resize());

let polygon;

let positionIcon = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="30px" height="30px" viewBox="-0.50 -0.5 30 30"><defs/><g><ellipse cx="10" cy="10" rx="10" ry="10" fill="#009900" stroke="#000000" pointer-events="none"/><ellipse cx="10" cy="10" rx="3" ry="3" fill="#ffffff" stroke="#000000" pointer-events="none"/></g></svg>`
let posIcon = new H.map.Icon(positionIcon);
const marker = new H.map.Marker(center, {volatility: true , icon:posIcon});
marker.draggable = true;
map.addObject(marker);

// Create reader object initializing it with a document:
var reader = new H.data.geojson.Reader('EarlyPolling.json');

// Parse the document:
reader.parse();

// Get KML layer from the reader object and add it to the map:
const layer = reader.getLayer();

map.addLayer(layer, 2);

const ui = H.ui.UI.createDefault(map, defaultLayers);

layer.getProvider().addEventListener('tap', function(ev) {
    // Log map object data. They contain name, description (if present in
    // KML) and the KML node itself.
    //console.log(ev.target.getData());
    //console.log(ev.target.getPosition());
    const info = ev.target.getData();
    console.log(info.properties);
    //console.log(info.pro)

    let content = '<b>' + info.properties.Name + '</b><br/>';
    content += info.properties.Address;

let bubble =  new H.ui.InfoBubble(ev.target.getGeometry(), {
  content: content
});
ui.addBubble(bubble);
});

// Add event listeners for marker movement
map.addEventListener('dragstart', evt => {
   if (evt.target instanceof H.map.Marker) behavior.disable();
}, false);
map.addEventListener('dragend', evt => {
   if (evt.target instanceof H.map.Marker) {
      behavior.enable();
      calculateIsoline();
   }
}, false);
map.addEventListener('drag', evt => {
   const pointer = evt.currentPointer;
   if (evt.target instanceof H.map.Marker) {
     evt.target.setGeometry(map.screenToGeo(pointer.viewportX, pointer.viewportY));
   }
}, false);

const hourFilter = new HourFilter();

async function calculateIsoline() {
   console.log('updating...')

   //Configure the options object
   const options = {
      mode: $('#car').checked ? 'car' : $('#pedestrian').checked ? 'pedestrian' : 'truck',
      range: $('#range').value,
      rangeType: $('#distance').checked ? 'distance' : 'time',
      center: marker.getGeometry(),
      date: $('#date-value').value === '' ? toDateInputFormat(new Date()) : $('#date-value').value,
      time: to24HourFormat($('#hour-slider').value)
   }

   //Limit max ranges
   if (options.rangeType === 'distance') {
      if (options.range > isolineMaxRange.distance) {
         options.range = isolineMaxRange.distance
      }
      $('#range').max = isolineMaxRange.distance;
   } else if (options.rangeType == 'time') {
      if (options.range > isolineMaxRange.time) {
         options.range = isolineMaxRange.time
      }
      $('#range').max = isolineMaxRange.time;
   }

   //Format label
   $('#slider-val').innerText = formatRangeLabel(options.range, options.rangeType);

   //Center map to isoline
   map.setCenter(options.center, true);
   const linestring = new H.geo.LineString();

   const isolineShape = await requestIsolineShape(options);
   isolineShape.forEach(p => linestring.pushLatLngAlt.apply(linestring, p));

   if (polygon !== undefined) {
      map.removeObject(polygon);
   }

   polygon = new H.map.Polygon(linestring, {
      style: {
         fillColor: 'rgba(74, 134, 255, 0.3)',
         strokeColor: '#4A86FF',
         lineWidth: 2
      }
   });
   map.addObject(polygon);
   //Enable bar graph for car and time options
   if (options.mode === 'car' && options.rangeType === 'time') {
      const promises = [];
      for (let i = 0; i < 24; i++) {
         options.time = to24HourFormat(i);
         promises.push(requestIsolineShape(options))
      }
      const polygons = await Promise.all(promises);
      const areas = polygons.map(x => turf.area(turf.polygon([x])));
      hourFilter.setData(areas);
   } else {
      hourFilter.hideData();
   }
}

calculateIsoline();

const rotation = new MapRotation(map);
function calculateView() {
   const options = {
      theme: $('#day').checked ? 'day' : 'night',
      static: $('#static').checked
   }
   if (options.static) {
      rotation.stop();
   } else {
      rotation.start();
   }
}
new Search('Austin, USA');
export {layer, calculateIsoline, marker, router, geocoder }
