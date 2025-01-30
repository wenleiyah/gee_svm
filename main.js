var Query = require('users/wenleiwork_eo_exercise/eo_thesis:DataQuery');
var CloudMask = require('users/wenleiwork_eo_exercise/eo_thesis:CloudMask');
var PCA = require('users/wenleiwork_eo_exercise/eo_thesis:PCA');
var GLCM = require('users/wenleiwork_eo_exercise/eo_thesis:GLCM');

/***** Define study area *****/
var bbox = ee.FeatureCollection('users/wenleiwork_eo_exercise/bbox_waterbody')
              .geometry() 
              .transform('EPSG:32648', 1); // Ensure study area CRS is EPSG:32648

Map.centerObject(bbox, 12);
Map.addLayer(bbox, {color: '006600', strokeWidth: 2}, 'Transformed Study Area');

/***** Define Sentinel-2 dataset for NDWI *****/
// var startDate = '2020-09-01';
// var endDate = '2020-09-05';
var startDate = '2020-08-01';
var endDate = '2020-08-31';
var sentinelCollection = ee.ImageCollection('COPERNICUS/S2_SR')
                          .filterBounds(bbox)
                          .filterDate(startDate, endDate)
                          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 15))
                          .map(CloudMask.maskSCLWithDilation)
                          .map(function(im) {
                              return im.clip(bbox);
                          });

if (sentinelCollection.size().lte(0).getInfo()) {
  throw new Error('No Sentinel-2 images found for the specified time range and cloud filter.');
}

var sentinelMosaic = sentinelCollection.mosaic().reproject({
  crs: 'EPSG:32648',
  scale: 10
});
print('Sentinel-2 Mosaic:', sentinelMosaic);
Map.addLayer(sentinelMosaic, {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000}, 'Sentinel-2 RGB');

/***** Calculate NDWI using Sentinel-2 data *****/
var calculateNDWI = function(image) {
  return image.normalizedDifference(['B3', 'B8']).rename('NDWI');
};

var ndwi = calculateNDWI(sentinelMosaic);
Map.addLayer(ndwi, {min: -1, max: 1, palette: ['blue', 'white', 'green']}, 'NDWI');

/***** Define water mask and generate sample points *****/
var ndwiThreshold = 0; // NDWI threshold for water extraction
var waterMask = ndwi.gt(ndwiThreshold).rename('water_mask').updateMask(ndwi.mask());
Map.addLayer(waterMask, {min: 0, max: 1, palette: ['white', 'blue']}, 'Water Mask');

var generateSamples = function(image, nWater, nNonWater) {
  var waterSamples = image.updateMask(image.eq(1))
                          .sample({
                            region: bbox,
                            scale: 10,
                            numPixels: nWater,
                            seed: 42,
                            geometries: true
                          });

  var nonWaterSamples = image.updateMask(image.eq(0))
                              .sample({
                                region: bbox,
                                scale: 10,
                                numPixels: nNonWater,
                                seed: 42,
                                geometries: true
                              });
  return waterSamples.merge(nonWaterSamples).map(function(feature) {
    return feature.set('class', ee.Algorithms.If(feature.get('water_mask'), 1, 0)); // Ensure binary class labels
  });
};

var samplePoints = generateSamples(waterMask, 800, 800); //(1200,1200) Experiment with more sampling points
print('Sample Points:', samplePoints);

/***** Define Landsat-8 dataset for specific date *****/
var landsatCollection = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
                          .filterBounds(bbox)
                          // .filterDate('2020-09-18', '2020-09-19')
                          .filterDate('2020-08-01', '2020-08-02')
                          .filter(ee.Filter.eq('WRS_PATH', 125))
                          .filter(ee.Filter.eq('WRS_ROW', 39))
                          .map(function(image) {
                            return image.select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5'], ['B2', 'B3', 'B4', 'B8'])
                                        .clip(bbox);
                          });

if (landsatCollection.size().lte(0).getInfo()) {
  throw new Error('No Landsat-8 images found for the specified date and region.');
}

var landsatImage = landsatCollection.mosaic().reproject({
  crs: 'EPSG:32648',
  scale: 30
});
print('Landsat-8 Image:', landsatImage);
Map.addLayer(landsatImage, {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000}, 'Landsat-8 RGB');

/***** Ensure Sample Points Have Necessary Properties *****/
var sampleBands = landsatImage.select(['B2', 'B3', 'B4', 'B8']);
samplePoints = samplePoints.map(function(point) {
  return point.setMulti(sampleBands.reduceRegion({
    reducer: ee.Reducer.first(),
    geometry: point.geometry(),
    scale: 30
  }));
});

/***** Perform PCA on Landsat-8 data *****/
var landsatBands = ['B2', 'B3', 'B4', 'B8'];
var pcaVisParams = {bands: ['PC1', 'PC2', 'PC3'], min: -2, max: 2};
var pcaImage = PCA.processAndVisualizePCA(landsatImage, bbox, 30, landsatBands, pcaVisParams);
print('PCA Image:', pcaImage);

/***** Compute GLCM texture features *****/
try {
  // var glcmFeatures = GLCM.computeGLCMTexture(['2020-09-18'], [pcaImage], bbox, 3);
  var glcmFeatures = GLCM.computeGLCMTexture(['2020-08-01'], [pcaImage], bbox, 3);
  var features = glcmFeatures[0];

  // Ensure consistent band naming
  var renamedFeatures = {
    entropy: features.entropy.rename('PC1_ent'),
    variance: features.variance.rename('PC1_var'),
    dissimilarity: features.dissimilarity.rename('PC1_diss')
  };

  Map.addLayer(renamedFeatures.entropy, {min: 0, max: 1}, 'PC1 Entropy');
  Map.addLayer(renamedFeatures.variance, {min: 0, max: 1}, 'PC1 Variance');
  Map.addLayer(renamedFeatures.dissimilarity, {min: 0, max: 1}, 'PC1 Dissimilarity');

  // Fill missing values with a default value
  renamedFeatures.entropy = renamedFeatures.entropy.unmask(0);
  renamedFeatures.variance = renamedFeatures.variance.unmask(0);
  renamedFeatures.dissimilarity = renamedFeatures.dissimilarity.unmask(0);
} catch (error) {
  print('Error in GLCM calculation:', error.message);
  throw error;
}


/***** Generate Samples for Extended Features *****/
var extendedBands = ['B2', 'B3', 'B4', 'B8', 'PC1_ent', 'PC1_var', 'PC1_diss'];
var extendedImage = landsatImage.addBands([
  renamedFeatures.entropy,
  renamedFeatures.variance,
  renamedFeatures.dissimilarity
]);

var extendedSamplePoints = extendedImage.sampleRegions({
  collection: samplePoints,
  properties: ['class'],
  scale: 30,
  geometries: true
});

/***** SVM Classification on Landsat-8 Bands *****/
var trainSamples = extendedSamplePoints.randomColumn('random', 42);
var trainingSet = trainSamples.filter(ee.Filter.lt('random', 0.7));
var validationSet = trainSamples.filter(ee.Filter.gte('random', 0.7));

var classifierBands = ['B2', 'B3', 'B4', 'B8'];
var classifier = ee.Classifier.libsvm({
  // cost: 10,            
  // kernelType: 'RBF',   
  // gamma: 0.25          
}).train({
  features: trainingSet,
  classProperty: 'class',
  inputProperties: classifierBands
});

var classifiedImage = landsatImage.select(classifierBands).classify(classifier);
Map.addLayer(classifiedImage, {min: 0, max: 1, palette: ['white', 'blue']}, 'SVM Classification (Bands Only)');

var validationMatrix = validationSet.classify(classifier).errorMatrix('class', 'classification');
print('Confusion Matrix (Bands Only):', validationMatrix);
print('Validation Accuracy (Bands Only):', validationMatrix.accuracy());

/***** SVM Classification on Bands + GLCM Features *****/
var extendedClassifier = ee.Classifier.libsvm({
  // cost: 1,            
  // kernelType: 'RBF',   
  // gamma: 0.15          
}).train({
  features: trainingSet,
  classProperty: 'class',
  inputProperties: extendedBands
});

var extendedClassifiedImage = extendedImage.select(extendedBands).classify(extendedClassifier);
Map.addLayer(extendedClassifiedImage, {min: 0, max: 1, palette: ['white', 'blue']}, 'SVM Classification (Bands + GLCM)');

var extendedValidationMatrix = validationSet.classify(extendedClassifier).errorMatrix('class', 'classification');
print('Confusion Matrix (Bands + GLCM):', extendedValidationMatrix);
print('Validation Accuracy (Bands + GLCM):', extendedValidationMatrix.accuracy());
