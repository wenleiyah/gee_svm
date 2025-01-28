// Sentinel-2 cloud masking function using SCL band
var maskSCLWithDilation = function(image) {
    var scl = image.select('SCL');
    
    // Define the SCL categories to be removed
    var cloudShadow = scl.eq(3); // cloud shadow
    var clouds = scl.eq(9); // high clouds
    var cirrus = scl.eq(10); // cirrus cloud
  
    // Combine cloud masks
    var cloudMask = cloudShadow.or(clouds).or(cirrus);
  
    // Dilate the cloud mask to remove edge artifacts
    var dilatedCloudMask = cloudMask.focal_min(30, 'circle', 'meters'); // Expand by 30 meters
  
    // Invert the mask to keep valid areas
    var finalMask = dilatedCloudMask.not();
  
    // Apply the mask to the image
    return image.updateMask(finalMask);
  };
  
  // Export the function
  exports.maskSCLWithDilation = maskSCLWithDilation;
  