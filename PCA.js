/**
 * PCA Module
 */
var performPCA = function(image, region, scale) {
  var bandNames = image.bandNames();

  // Check if the input image has valid bands
  if (bandNames.size().eq(0).getInfo()) {
    throw new Error('Input image has no bands. Ensure the input image is valid and contains the required bands.');
  }

  // Calculate mean for each band
  var meanDict = image.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: region,
    scale: scale,
    maxPixels: 1e8
  });

  // Create an image of means for each band
  var means = ee.Image.constant(
    bandNames.map(function(name) {
      return meanDict.get(name);
    })
  ).rename(bandNames);

  // Center the bands by subtracting the mean
  var centered = image.subtract(means);

  // Compute the covariance matrix
  var covarArray = centered.toArray();
  var covar = covarArray.reduceRegion({
    reducer: ee.Reducer.centeredCovariance(),
    geometry: region,
    scale: scale,
    maxPixels: 1e8
  }).get('array');

  // Compute eigenvalues and eigenvectors
  var eigens = ee.Array(covar).eigen();
  var eigenVectors = eigens.slice(1, 1);

  // Project the image onto principal component space
  var projection = ee.Image(eigenVectors).matrixMultiply(covarArray.toArray(1));

  // Flatten the projected array into individual bands
  var pcLabels = ee.List.sequence(1, bandNames.size())
    .map(function(i) {
      return ee.String('PC').cat(ee.Number(i).format('%d'));
    });

  var pcImage = projection.arrayFlatten([pcLabels, ['pixel']]);

  return pcImage.rename(pcLabels);
};

/**
 * Perform PCA and visualize results
 */
var processAndVisualizePCA = function(image, region, scale, bands, visParams) {
  var pcaImage = performPCA(image.select(bands), region, scale);
  print('PCA Result:', pcaImage);
  Map.addLayer(pcaImage, visParams, 'PCA Result');
  return pcaImage;
};

// Export functions for external usage
exports.performPCA = performPCA;
exports.processAndVisualizePCA = processAndVisualizePCA;