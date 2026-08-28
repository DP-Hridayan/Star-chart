const MILESTONE_STEPS = [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000];

function calculateMilestoneStep(totalStars) {
  for (const step of MILESTONE_STEPS) {
    if (totalStars / step <= 6) {
      return step;
    }
  }
  return MILESTONE_STEPS[MILESTONE_STEPS.length - 1];
}

function formatMilestoneLabel(starCount) {
  if (starCount >= 1_000_000) {
    return `\u2605 ${Math.floor(starCount / 1_000_000)}M`;
  }
  if (starCount >= 1_000) {
    const thousands = starCount / 1_000;
    return `\u2605 ${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K`;
  }
  return `\u2605 ${starCount.toLocaleString()}`;
}

function extractMilestones(counts) {
  const total = counts[counts.length - 1] || 0;
  const step = calculateMilestoneStep(total);
  const result = [];
  const seenThresholds = new Set();
  
  for (let threshold = step; threshold <= total; threshold += step) {
    for (let index = 0; index < counts.length; index++) {
      if (counts[index] >= threshold && !seenThresholds.has(threshold)) {
        seenThresholds.add(threshold);
        result.push({ index, label: formatMilestoneLabel(threshold) });
        break;
      }
    }
  }
  return result;
}

module.exports = {
  extractMilestones,
};
