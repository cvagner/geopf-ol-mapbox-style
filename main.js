import Map from 'ol/Map.js';
import { and, like, intersects, equalTo } from 'ol/format/filter';
import GeoJSON from 'ol/format/GeoJSON.js';
import MVT from 'ol/format/MVT';
import WFSFormat from 'ol/format/WFS';
import Point from 'ol/geom/Point';
import { Tile as TileLayer } from 'ol/layer.js';
import VectorLayer from 'ol/layer/Vector'
import VectorTileLayer from 'ol/layer/VectorTile';
import { getArea } from 'ol/sphere';
import VectorSource from 'ol/source/Vector';
import VectorTileSource from 'ol/source/VectorTile';
import WMTSSource from 'ol/source/WMTS';
import WMTSTileGrid from 'ol/tilegrid/WMTS';

// Cf. https://github.com/openlayers/ol-mapbox-style
import { applyStyle } from 'ol-mapbox-style';

// Couche BDTOPO
const bdtopoLayer = new VectorTileLayer({
  declutter: true,
  source: new VectorTileSource({
    maxZoom: 15,
    format: new MVT(),
    url:
      'https://data.geopf.fr/tms/1.0.0/BDTOPO/{z}/{x}/{y}.pbf'
  })
});
// Style BDTOPO https://geoservices.ign.fr/documentation/services/api-et-services-ogc/tuiles-vectorielles-tmswmts/styles#39354
applyStyle(bdtopoLayer, 'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/BDTOPO/bati.json');

// Couche des orthophotos
const resolutions = [
  156543.03392804103,
  78271.5169640205,
  39135.75848201024,
  19567.879241005125,
  9783.939620502562,
  4891.969810251281,
  2445.9849051256406,
  1222.9924525628203,
  611.4962262814101,
  305.74811314070485,
  152.87405657035254,
  76.43702828517625,
  38.218514142588134,
  19.109257071294063,
  9.554628535647034,
  4.777314267823517,
  2.3886571339117584,
  1.1943285669558792,
  0.5971642834779396,
  0.29858214173896974,
  0.14929107086948493,
  0.07464553543474241
];
const orthophotoLayer = new TileLayer({
  source: new WMTSSource({
    url: "https://data.geopf.fr/wmts",
    layer: "ORTHOIMAGERY.ORTHOPHOTOS",
    matrixSet: "PM",
    format: "image/jpeg",
    style: "normal",
    tileGrid: new WMTSTileGrid({
      origin: [-20037508, 20037508], // topLeftCorner
      resolutions: resolutions, // résolutions
      matrixIds: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"] // ids des TileMatrix
    })
  })
});

// Source des batiments sélectionnés
const selectedSource = new VectorSource();

const map = new Map({
  target: 'map',
  layers: [
    orthophotoLayer,
    bdtopoLayer,
    new VectorLayer({
      source: selectedSource,
      style: {
        'stroke-color': 'blue',
        'stroke-width': 1,
        'fill-color': 'blue',
        'text-value': ['get', 'cleabs'],
        'text-fill-color': 'blue',
        'text-overflow': false,
      },
    })
  ]
})

// Zoom sur un quartier de Dijon par défaut
let dijonExtent = [561156.3584244443, 5998685.964885023, 561713.7014265041, 5998807.655496827];
map.getView().fit(dijonExtent);

// Requête WFS GetFeature pour charger les informations de la feature sous le clic
map.on(/*'pointermove'*/'click', async function(evt) {
  selectedSource.clear()

  // Approche 1 non concluante > on cherche l'identifiant de la feature sous le clic, puis on récupère les info complémentaires
  // avec une requête cleabs = xxx. La requête GetFeature hyper longuer => pas d'index sur cleabs ?
  // Approche 2, on fait une requête spatiale > GetFeature avec intersects

  // Recherche de la feature (qui n'a pas la géométrie car mvt)
  // const features = await bdtopoLayer.getFeatures(evt.pixel);
  // if (!features || features.length<1) {
  //   return;
  // }
  // const cleabs = features[0].get('cleabs');

  const featureRequest = new WFSFormat().writeGetFeature({
    srsName: 'EPSG:3857',
    featureNS: 'http://BDTOPO_V3',
    featurePrefix: 'BDTOPO_V3',
    featureTypes: ['batiment'],
    outputFormat: 'application/json',
    filter:
      // and(
        intersects('geometrie', new Point(evt.coordinate)),
      //   equalTo('cleabs', cleabs),
      //   like('usage_1', '*')// ne sert à rien !
      // ),
  });

  fetch('https://data.geopf.fr/wfs', {
    method: 'POST',
    body: new XMLSerializer().serializeToString(featureRequest),
  })
    .then(function (response) {
      return response.json();
    })
    .then(function (json) {
      const features = new GeoJSON().readFeatures(json);
      if (features && features.length>0) {
        // On ne conserve que la première
        displayFeatureInfo(features[0]);
      }
    });
})

const displayFeatureInfo = function(feature) {
  if (!feature) {
    return;
  }
  selectedSource.addFeature(feature);
  
  const geometry = feature.getGeometry();
  const surface = Math.round(getArea(geometry)*10)/10;
  const cleabs = feature.get('cleabs');
  const usage1 = feature.get('usage_1');
  const dateApparition = feature.get('date_d_apparition');
  
  document.getElementById('info').innerHTML =
    `Bâtiment : ${cleabs} ${usage1} ${surface}m2 (${dateApparition ? new Date(dateApparition).getFullYear() : 'inconnue'})`;
}
