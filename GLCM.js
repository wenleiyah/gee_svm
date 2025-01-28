/**
 * Compute GLCM texture features
 */
function computeGLCMTexture(datesOfInterest, pcaLayers, bbox, size) {
  size = size || 3; // Set default sliding window size to 3

  return datesOfInterest.map(function(date, index) {
    var pcaImage = pcaLayers[index];

    // Select PC1
    var pc1 = pcaImage.select('PC1');

    // Clip to study area
    var boundedPC1 = pc1.clip(bbox);

    // Dynamically normalize range
    var minMaxDict = boundedPC1.reduceRegion({
      reducer: ee.Reducer.minMax(),
      geometry: bbox,
      scale: 10,
      maxPixels: 1e13
    });

    var minValue = ee.Number(minMaxDict.get('PC1_min', -2));
    var maxValue = ee.Number(minMaxDict.get('PC1_max', 2));

    // Normalize and convert to byte format
    var pc1Normalized = boundedPC1.unitScale(minValue, maxValue).multiply(255).toByte();

    // Compute GLCM texture features
    var pc1GLCM = pc1Normalized.glcmTexture({size: size});

    // Select specific GLCM features
    var pc1Entropy = pc1GLCM.select('PC1_ent');
    var pc1Variance = pc1GLCM.select('PC1_var');
    var pc1Dissimilarity = pc1GLCM.select('PC1_diss');

    // Return an object containing the date and GLCM features
    return {
      date: date,
      entropy: pc1Entropy,
      variance: pc1Variance,
      dissimilarity: pc1Dissimilarity
    };
  });
}

// Export function
exports.computeGLCMTexture = computeGLCMTexture;
