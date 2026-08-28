function calculateCeiling(value) {
  if (value <= 0) return 100;
  const magnitude = Math.pow(10, String(Math.floor(value)).length - 1);
  return Math.ceil(value / magnitude) * magnitude;
}

function formatYAxisValue(value) {
  if (value >= 1_000_000) {
    return `${Math.floor(value / 1_000_000)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K`;
  }
  return String(value);
}

function generateSmoothPath(xCoordinates, yCoordinates) {
  if (!xCoordinates.length) return '';
  if (xCoordinates.length === 1) {
    return `M ${xCoordinates[0].toFixed(1)} ${yCoordinates[0].toFixed(1)}`;
  }
  
  const pathParts = [`M ${xCoordinates[0].toFixed(1)} ${yCoordinates[0].toFixed(1)}`];
  for (let i = 1; i < xCoordinates.length; i++) {
    const controlX = ((xCoordinates[i - 1] + xCoordinates[i]) / 2).toFixed(1);
    pathParts.push(
      `C ${controlX} ${yCoordinates[i - 1].toFixed(1)} ${controlX} ${yCoordinates[i].toFixed(1)} ${xCoordinates[i].toFixed(1)} ${yCoordinates[i].toFixed(1)}`
    );
  }
  return pathParts.join(' ');
}

module.exports = {
  calculateCeiling,
  formatYAxisValue,
  generateSmoothPath,
};
