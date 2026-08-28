function determineBucketType(history) {
  const firstDate = new Date(history[0].date);
  const lastDate = new Date(history[history.length - 1].date);
  const ageDays = (lastDate - firstDate) / 86400000;
  
  if (ageDays < 90) return 'week';
  if (ageDays < 365) return 'month';
  if (ageDays < 1095) return 'month_year';
  return 'quarter';
}

function formatBucketKey(dateString, bucketType) {
  const dateObj = new Date(dateString);
  
  if (bucketType === 'week') {
    const dayOfWeek = dateObj.getUTCDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mondayDate = new Date(dateObj);
    mondayDate.setUTCDate(dateObj.getUTCDate() + diffToMonday);
    return mondayDate.toISOString().split('T')[0];
  }
  
  if (bucketType === 'month' || bucketType === 'month_year') {
    return dateString.slice(0, 7);
  }
  
  const quarter = Math.floor(dateObj.getUTCMonth() / 3) + 1;
  return `${dateObj.getUTCFullYear()}-Q${quarter}`;
}

function parseBucketStartDate(bucketKey, bucketType) {
  if (bucketType === 'week' || bucketType === 'month' || bucketType === 'month_year') {
    const isoFormatString = bucketKey.length === 7 ? `${bucketKey}-01` : bucketKey;
    return new Date(`${isoFormatString}T00:00:00Z`);
  }
  
  const [year, quarterStr] = bucketKey.split('-');
  const monthNumber = (parseInt(quarterStr[1], 10) - 1) * 3 + 1;
  const paddedMonth = String(monthNumber).padStart(2, '0');
  return new Date(`${year}-${paddedMonth}-01T00:00:00Z`);
}

function formatRelativeTimeLabel(bucketKey, bucketType, firstDate) {
  const bucketDate = parseBucketStartDate(bucketKey, bucketType);
  const elapsedDays = Math.round((bucketDate - firstDate) / 86400000);
  
  if (elapsedDays < 1) return 'Start';
  if (elapsedDays < 30) return elapsedDays === 1 ? '1 day' : `${elapsedDays} days`;
  
  const elapsedMonths = Math.round(elapsedDays / 30.44);
  return elapsedMonths === 1 ? '1 month' : `${elapsedMonths} months`;
}

function aggregateIntoBuckets(history) {
  if (!history.length) {
    return { counts: [], labels: [] };
  }
  
  const bucketType = determineBucketType(history);
  const currentDateString = new Date().toISOString().split('T')[0];
  const todayBucketKey = formatBucketKey(currentDateString, bucketType);
  const bucketMap = {};
  
  for (const entry of history) {
    const key = formatBucketKey(entry.date, bucketType);
    if (key > todayBucketKey) continue;
    bucketMap[key] = Math.max(bucketMap[key] || 0, entry.cumulative);
  }
  
  const sortedBucketKeys = Object.keys(bucketMap).sort();
  if (!sortedBucketKeys.length) {
    return { counts: [], labels: [] };
  }
  
  const firstDate = parseBucketStartDate(sortedBucketKeys[0], bucketType);
  
  return {
    counts: sortedBucketKeys.map((key) => bucketMap[key]),
    labels: sortedBucketKeys.map((key) => formatRelativeTimeLabel(key, bucketType, firstDate)),
  };
}

module.exports = {
  aggregateIntoBuckets,
};
