const { getTheme } = require('./theme');
const { calculateCeiling, formatYAxisValue, generateSmoothPath } = require('./utils');
const { aggregateIntoBuckets } = require('../bucketing');
const { extractMilestones } = require('../milestones');

const SVG_WIDTH = 800;
const SVG_HEIGHT = 400;
const PADDING_LEFT = 58;
const PADDING_RIGHT = 24;
const PADDING_TOP = 36;
const PADDING_BOTTOM = 48;
const CHART_WIDTH = SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const CHART_HEIGHT = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const GRID_LINES_COUNT = 5;
const MAX_X_TICKS = 3;

function generateEmptyStateSvg(theme, repoLabel) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
  <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" rx="12" fill="${theme.bg}"/>
  <text x="${SVG_WIDTH / 2}" y="${SVG_HEIGHT / 2}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="${theme.axisText}">No star data found for ${repoLabel}</text>
</svg>`;
}

function generateSvgStart() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">`;
}

function generateSvgStyles(theme, pathLength) {
  return `<style>
  .ax{font:11px sans-serif;fill:${theme.axisText}}
  .ti{font:bold 13px sans-serif;fill:${theme.titleText}}
  .ms{font:bold 10px sans-serif;fill:${theme.pillText}}
  #ln{stroke-dasharray:${pathLength};stroke-dashoffset:${pathLength};animation:draw 1.6s cubic-bezier(.4,0,.2,1) forwards}
  @keyframes draw{to{stroke-dashoffset:0}}
</style>`;
}

function generateSvgDefs(theme) {
  return `<defs>
  <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${theme.gradTop}" stop-opacity="0.28"/>
    <stop offset="100%" stop-color="${theme.gradBot}" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="cp"><rect x="${PADDING_LEFT}" y="${PADDING_TOP}" width="${CHART_WIDTH}" height="${CHART_HEIGHT}"/></clipPath>
</defs>`;
}

function generateBackground(theme) {
  return `<rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" rx="12" fill="${theme.bg}"/>\n<rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" rx="12" fill="none" stroke="${theme.border}" stroke-width="1"/>`;
}

function generateGridAndAxes(theme, yValues, xTicks, labels, calculateYCoordinate, calculateXCoordinate) {
  const elements = [];
  
  for (const value of yValues) {
    const yCoord = calculateYCoordinate(value).toFixed(1);
    elements.push(`<line x1="${PADDING_LEFT}" y1="${yCoord}" x2="${PADDING_LEFT + CHART_WIDTH}" y2="${yCoord}" stroke="${theme.grid}" stroke-width="1"/>`);
    elements.push(`<line x1="${PADDING_LEFT - 4}" y1="${yCoord}" x2="${PADDING_LEFT}" y2="${yCoord}" stroke="${theme.axis}" stroke-width="1"/>`);
    elements.push(`<text x="${PADDING_LEFT - 8}" y="${(calculateYCoordinate(value) + 4).toFixed(1)}" text-anchor="end" class="ax">${formatYAxisValue(value)}</text>`);
  }

  elements.push(`<line x1="${PADDING_LEFT}" y1="${PADDING_TOP}" x2="${PADDING_LEFT}" y2="${PADDING_TOP + CHART_HEIGHT}" stroke="${theme.axis}" stroke-width="1.5"/>`);
  elements.push(`<line x1="${PADDING_LEFT}" y1="${PADDING_TOP + CHART_HEIGHT}" x2="${PADDING_LEFT + CHART_WIDTH}" y2="${PADDING_TOP + CHART_HEIGHT}" stroke="${theme.axis}" stroke-width="1.5"/>`);

  for (const index of xTicks) {
    const xCoord = calculateXCoordinate(index).toFixed(1);
    elements.push(`<line x1="${xCoord}" y1="${PADDING_TOP + CHART_HEIGHT}" x2="${xCoord}" y2="${PADDING_TOP + CHART_HEIGHT + 5}" stroke="${theme.axis}" stroke-width="1.5"/>`);
    elements.push(`<text x="${xCoord}" y="${PADDING_TOP + CHART_HEIGHT + 18}" text-anchor="middle" class="ax">${labels[index]}</text>`);
  }
  
  return elements.join('\n');
}

function generateChartPaths(theme, areaPath, linePath) {
  return `<path d="${areaPath}" fill="url(#gr)" clip-path="url(#cp)"/>\n<path id="ln" d="${linePath}" fill="none" stroke="${theme.line}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#cp)"/>`;
}

function generateMilestoneMarkers(theme, milestones, counts, calculateXCoordinate, calculateYCoordinate) {
  const elements = [];
  
  for (let idx = 0; idx < milestones.length; idx++) {
    const { index: bucketIndex, label } = milestones[idx];
    const markerX = calculateXCoordinate(bucketIndex).toFixed(1);
    const markerY = calculateYCoordinate(counts[bucketIndex]);
    const isPlacedAbove = idx % 2 === 0;
    
    let labelY = isPlacedAbove ? markerY - 18 : markerY + 26;
    labelY = Math.max(PADDING_TOP + 14, Math.min(labelY, PADDING_TOP + CHART_HEIGHT - 4));
    
    const labelWidth = label.length * 7 + 10;
    const labelX = (calculateXCoordinate(bucketIndex) - labelWidth / 2).toFixed(1);
    
    elements.push(`<circle cx="${markerX}" cy="${markerY.toFixed(1)}" r="4" fill="${theme.dot}" stroke="${theme.bg}" stroke-width="1.5"/>`);
    elements.push(`<rect x="${labelX}" y="${(labelY - 12).toFixed(1)}" width="${labelWidth}" height="16" rx="8" fill="${theme.pillBg}" stroke="${theme.pillBorder}" stroke-width="0.8"/>`);
    elements.push(`<text x="${markerX}" y="${labelY.toFixed(1)}" text-anchor="middle" class="ms">${label}</text>`);
  }
  
  return elements.join('\n');
}

function generateTextLabels(repoLabel, totalStars) {
  return `<text x="${PADDING_LEFT}" y="${PADDING_TOP + 14}" class="ti">${repoLabel}</text>\n<text x="${SVG_WIDTH - PADDING_RIGHT}" y="${PADDING_TOP + 14}" text-anchor="end" class="ti">&#9733; ${totalStars.toLocaleString()} stars</text>`;
}

function calculatePathLength(xCoordinates, yCoordinates) {
  let pathLength = 100;
  for (let i = 1; i < xCoordinates.length; i++) {
    pathLength += Math.hypot(xCoordinates[i] - xCoordinates[i - 1], yCoordinates[i] - yCoordinates[i - 1]);
  }
  return Math.ceil(pathLength * 1.3);
}

function getXTicks(totalDataPoints) {
  const stepX = Math.max(1, Math.ceil(totalDataPoints / MAX_X_TICKS));
  const xTicks = [];
  for (let i = 0; i < totalDataPoints; i += stepX) {
    xTicks.push(i);
  }
  if (!xTicks.includes(totalDataPoints - 1)) {
    xTicks.push(totalDataPoints - 1);
  }
  return xTicks;
}

function buildChartSvg(history, themeName, repoLabel) {
  const theme = getTheme(themeName);
  const { counts, labels } = aggregateIntoBuckets(history);
  const dataPointsCount = counts.length;

  if (dataPointsCount === 0) {
    return generateEmptyStateSvg(theme, repoLabel);
  }

  const totalStars = counts[dataPointsCount - 1];
  const yMaximum = calculateCeiling(totalStars * 1.08);
  
  const calculateXCoordinate = (index) => dataPointsCount <= 1 ? PADDING_LEFT + CHART_WIDTH / 2 : PADDING_LEFT + (index / (dataPointsCount - 1)) * CHART_WIDTH;
  const calculateYCoordinate = (count) => PADDING_TOP + CHART_HEIGHT - (count / yMaximum) * CHART_HEIGHT;

  const xCoordinates = counts.map((_, index) => calculateXCoordinate(index));
  const yCoordinates = counts.map((count) => calculateYCoordinate(count));
  
  const linePathDefinition = generateSmoothPath(xCoordinates, yCoordinates);
  const areaPathDefinition = `${linePathDefinition} L ${xCoordinates[dataPointsCount - 1].toFixed(1)} ${(PADDING_TOP + CHART_HEIGHT).toFixed(1)} L ${xCoordinates[0].toFixed(1)} ${(PADDING_TOP + CHART_HEIGHT).toFixed(1)} Z`;

  const pathLength = calculatePathLength(xCoordinates, yCoordinates);
  const xTicks = getXTicks(dataPointsCount);
  const yValues = Array.from({ length: GRID_LINES_COUNT + 1 }, (_, index) => Math.round((yMaximum * index) / GRID_LINES_COUNT));
  const milestones = extractMilestones(counts);

  const svgParts = [
    generateSvgStart(),
    generateSvgStyles(theme, pathLength),
    generateSvgDefs(theme),
    generateBackground(theme),
    generateGridAndAxes(theme, yValues, xTicks, labels, calculateYCoordinate, calculateXCoordinate),
    generateChartPaths(theme, areaPathDefinition, linePathDefinition),
    generateMilestoneMarkers(theme, milestones, counts, calculateXCoordinate, calculateYCoordinate),
    generateTextLabels(repoLabel, totalStars),
    '</svg>'
  ];

  return svgParts.join('\n');
}

module.exports = {
  buildChartSvg,
};
