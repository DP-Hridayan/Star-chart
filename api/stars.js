const https = require('https');

// ── GitHub API ────────────────────────────────────────────────────────────────

function get(path, token, accept) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: accept || 'application/vnd.github+json',
          'User-Agent': 'dp-star-chart/1.0',
        },
      },
      res => {
        let body = '';
        res.on('data', c => (body += c));
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error(`JSON parse error: ${body.slice(0, 200)}`)); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function fetchAllStargazers(owner, repo, token) {
  // 1. Get total star count so we can parallelise page fetches
  const repoData = await get(`/repos/${owner}/${repo}`, token);
  if (repoData.message) throw new Error(`GitHub API (repo): ${repoData.message}`);

  const total = repoData.stargazers_count || 0;
  if (total === 0) return [];

  const totalPages = Math.ceil(total / 100);

  // 2. Probe first page first — surfaces auth/scope errors before parallel blast
  const firstPage = await get(
    `/repos/${owner}/${repo}/stargazers?per_page=100&page=1`,
    token,
    'application/vnd.github.star+json'
  );
  if (!Array.isArray(firstPage)) {
    throw new Error(`GitHub API (stargazers): ${firstPage.message || JSON.stringify(firstPage)}`);
  }

  // 3. Fetch remaining pages in parallel
  const restPages = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          get(
            `/repos/${owner}/${repo}/stargazers?per_page=100&page=${i + 2}`,
            token,
            'application/vnd.github.star+json'
          )
        )
      )
    : [];

  const pages = [firstPage, ...restPages];

  // 4. Count stars per day, build cumulative array
  const dateCounts = {};
  for (const page of pages) {
    if (!Array.isArray(page)) {
      throw new Error(`GitHub API (page): ${page.message || JSON.stringify(page)}`);
    }
    for (const entry of page) {
      const date = (entry.starred_at || '').split('T')[0];
      if (date) dateCounts[date] = (dateCounts[date] || 0) + 1;
    }
  }

  let cumulative = 0;
  return Object.keys(dateCounts)
    .sort()
    .map(date => ({ date, cumulative: (cumulative += dateCounts[date]) }));
}

// ── Adaptive time bucketing ───────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getBucketType(history) {
  const ageDays =
    (new Date(history[history.length - 1].date) - new Date(history[0].date)) / 86_400_000;
  if (ageDays < 90)   return 'week';
  if (ageDays < 365)  return 'month';
  if (ageDays < 1095) return 'month_year';
  return 'quarter';
}

function bucketKey(dateStr, type) {
  const d = new Date(dateStr);
  if (type === 'week') {
    const dow = d.getUTCDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() + diff);
    return mon.toISOString().split('T')[0];
  }
  if (type === 'month' || type === 'month_year') return dateStr.slice(0, 7);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

// Convert a bucket key back to its start date (UTC)
function bucketStartDate(key, type) {
  if (type === 'week' || type === 'month' || type === 'month_year') {
    const iso = key.length === 7 ? key + '-01' : key; // YYYY-MM → YYYY-MM-01
    return new Date(iso + 'T00:00:00Z');
  }
  // quarter: "2024-Q2" → April 1 2024
  const [year, q] = key.split('-');
  const month = (parseInt(q[1]) - 1) * 3 + 1;
  return new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00Z`);
}

// X-axis label as elapsed time from firstDate — full words, months only
function relativeTimeLabel(key, type, firstDate, isLast) {
  if (isLast) return 'Now';
  const d = bucketStartDate(key, type);
  const days = Math.round((d - firstDate) / 86_400_000);
  if (days < 1) return 'Start';
  if (days < 30) return days === 1 ? '1 day' : `${days} days`;
  const months = Math.round(days / 30.44);
  return months === 1 ? '1 month' : `${months} months`;
}

function buildBuckets(history) {
  if (!history.length) return { counts: [], labels: [] };
  const type = getBucketType(history);
  // Safety: never create buckets beyond today
  const todayKey = bucketKey(new Date().toISOString().split('T')[0], type);
  const map = {};
  for (const e of history) {
    const k = bucketKey(e.date, type);
    if (k > todayKey) continue;
    map[k] = Math.max(map[k] || 0, e.cumulative);
  }
  const keys = Object.keys(map).sort();
  if (!keys.length) return { counts: [], labels: [] };
  const firstDate = bucketStartDate(keys[0], type);
  return {
    counts: keys.map(k => map[k]),
    labels: keys.map((k, i) => relativeTimeLabel(k, type, firstDate, i === keys.length - 1)),
  };
}

// ── Milestones ────────────────────────────────────────────────────────────────

const NICE_STEPS = [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000];

function milestoneStep(total) {
  for (const s of NICE_STEPS) if (total / s <= 6) return s;
  return NICE_STEPS[NICE_STEPS.length - 1];
}

function fmtMilestone(n) {
  if (n >= 1_000_000) return `\u2605 ${Math.floor(n / 1_000_000)}M`;
  if (n >= 1_000) {
    const v = n / 1_000;
    return `\u2605 ${Number.isInteger(v) ? v : v.toFixed(1)}K`;
  }
  return `\u2605 ${n.toLocaleString()}`;
}

function getMilestones(counts) {
  const total = counts[counts.length - 1] || 0;
  const step  = milestoneStep(total);
  const result = [];
  const seen   = new Set();
  for (let thresh = step; thresh <= total; thresh += step) {
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] >= thresh && !seen.has(thresh)) {
        seen.add(thresh);
        result.push({ i, label: fmtMilestone(thresh) });
        break;
      }
    }
  }
  return result;
}

// ── SVG ───────────────────────────────────────────────────────────────────────

const THEMES = {
  light: {
    bg: '#ffffff', border: '#e0e0e0', grid: '#f0f0f0',
    axisText: '#5f6368', titleText: '#1c1b1f',
    line: '#1a73e8', gradTop: '#1a73e8', gradBot: '#ffffff',
    dot: '#1a73e8', pillBg: '#e8f0fe', pillBorder: '#1a73e8', pillText: '#1c1b1f',
  },
  dark: {
    bg: '#1e1e2e', border: '#313244', grid: '#2a2a3e',
    axisText: '#a6adc8', titleText: '#cdd6f4',
    line: '#89b4fa', gradTop: '#89b4fa', gradBot: '#1e1e2e',
    dot: '#89b4fa', pillBg: '#1e3a5f', pillBorder: '#89b4fa', pillText: '#cdd6f4',
  },
};

function niceCeil(v) {
  if (v <= 0) return 100;
  const mag = Math.pow(10, String(Math.floor(v)).length - 1);
  return Math.ceil(v / mag) * mag;
}

function fmtY(v) {
  if (v >= 1_000_000) return `${Math.floor(v / 1_000_000)}M`;
  if (v >= 1_000) { const k = v / 1_000; return `${Number.isInteger(k) ? k : k.toFixed(1)}K`; }
  return String(v);
}

function smoothPath(xs, ys) {
  if (!xs.length) return '';
  if (xs.length === 1) return `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  const d = [`M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`];
  for (let i = 1; i < xs.length; i++) {
    const cx = ((xs[i - 1] + xs[i]) / 2).toFixed(1);
    d.push(`C ${cx} ${ys[i-1].toFixed(1)} ${cx} ${ys[i].toFixed(1)} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`);
  }
  return d.join(' ');
}

function generateSVG(history, themeName, repoLabel) {
  const t = THEMES[themeName] || THEMES.light;
  const { counts, labels } = buildBuckets(history);
  const n = counts.length;

  if (n === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="400" viewBox="0 0 480 400">
  <rect width="480" height="400" rx="12" fill="${t.bg}"/>
  <text x="240" y="200" text-anchor="middle" font-family="sans-serif" font-size="14" fill="${t.axisText}">No star data found for ${repoLabel}</text>
</svg>`;
  }

  const total = counts[n - 1];
  const W = 480, H = 400;
  const PL = 54, PR = 16, PT = 36, PB = 44;
  const CW = W - PL - PR, CH = H - PT - PB;
  const GRID = 5, MAX_TICKS = 2;

  const yMax = niceCeil(total * 1.08);
  const px   = i => n <= 1 ? PL + CW / 2 : PL + (i / (n - 1)) * CW;
  const py   = c => PT + CH - (c / yMax) * CH;

  const xs     = counts.map((_, i) => px(i));
  const ys     = counts.map(c => py(c));
  const lineD  = smoothPath(xs, ys);
  const areaD  = `${lineD} L ${xs[n-1].toFixed(1)} ${(PT+CH).toFixed(1)} L ${xs[0].toFixed(1)} ${(PT+CH).toFixed(1)} Z`;

  let pLen = 100;
  for (let i = 1; i < xs.length; i++) pLen += Math.hypot(xs[i]-xs[i-1], ys[i]-ys[i-1]);
  pLen = Math.ceil(pLen * 1.3);

  const stepX  = Math.max(1, Math.ceil(n / MAX_TICKS));
  const xTicks = [];
  for (let i = 0; i < n; i += stepX) xTicks.push(i);
  if (!xTicks.includes(n - 1)) xTicks.push(n - 1);

  const yVals     = Array.from({length: GRID + 1}, (_, i) => Math.round(yMax * i / GRID));
  const milestones = getMilestones(counts);

  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  o.push(`<style>
  .ax{font:11px sans-serif;fill:${t.axisText}}
  .ti{font:bold 13px sans-serif;fill:${t.titleText}}
  .ms{font:bold 10px sans-serif;fill:${t.pillText}}
  #ln{stroke-dasharray:${pLen};stroke-dashoffset:${pLen};animation:draw 1.6s cubic-bezier(.4,0,.2,1) forwards}
  @keyframes draw{to{stroke-dashoffset:0}}
</style>`);
  o.push(`<defs>
  <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${t.gradTop}" stop-opacity="0.28"/>
    <stop offset="100%" stop-color="${t.gradBot}" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="cp"><rect x="${PL}" y="${PT}" width="${CW}" height="${CH}"/></clipPath>
</defs>`);

  o.push(`<rect width="${W}" height="${H}" rx="12" fill="${t.bg}"/>`);
  o.push(`<rect width="${W}" height="${H}" rx="12" fill="none" stroke="${t.border}" stroke-width="1"/>`);

  for (const v of yVals) {
    const y = py(v).toFixed(1);
    o.push(`<line x1="${PL}" y1="${y}" x2="${PL+CW}" y2="${y}" stroke="${t.grid}" stroke-width="1"/>`);
    o.push(`<text x="${PL-6}" y="${(py(v)+4).toFixed(1)}" text-anchor="end" class="ax">${fmtY(v)}</text>`);
  }

  for (const i of xTicks) {
    const x = px(i).toFixed(1);
    o.push(`<line x1="${x}" y1="${PT+CH}" x2="${x}" y2="${PT+CH+4}" stroke="${t.axisText}" stroke-width="1"/>`);
    o.push(`<text x="${x}" y="${PT+CH+16}" text-anchor="middle" class="ax">${labels[i]}</text>`);
  }

  o.push(`<path d="${areaD}" fill="url(#gr)" clip-path="url(#cp)"/>`);
  o.push(`<path id="ln" d="${lineD}" fill="none" stroke="${t.line}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#cp)"/>`);

  for (let idx = 0; idx < milestones.length; idx++) {
    const { i: bi, label } = milestones[idx];
    const mx  = px(bi).toFixed(1);
    const my  = py(counts[bi]);
    const above = idx % 2 === 0;
    let ly = above ? my - 18 : my + 26;
    ly = Math.max(PT + 14, Math.min(ly, PT + CH - 4));
    const lw = label.length * 7 + 10;
    const lx = (px(bi) - lw / 2).toFixed(1);
    o.push(`<circle cx="${mx}" cy="${my.toFixed(1)}" r="4" fill="${t.dot}" stroke="${t.bg}" stroke-width="1.5"/>`);
    o.push(`<rect x="${lx}" y="${(ly-12).toFixed(1)}" width="${lw}" height="16" rx="8" fill="${t.pillBg}" stroke="${t.pillBorder}" stroke-width="0.8"/>`);
    o.push(`<text x="${mx}" y="${ly.toFixed(1)}" text-anchor="middle" class="ms">${label}</text>`);
  }

  // Repo label (top-left) + total stars (top-right)
  o.push(`<text x="${PL}" y="${PT+14}" class="ti">${repoLabel}</text>`);
  o.push(`<text x="${W-PR}" y="${PT+14}" text-anchor="end" class="ti">&#9733; ${total.toLocaleString()} stars</text>`);

  o.push('</svg>');
  return o.join('\n');
}

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).setHeader('Content-Type', 'text/plain').send('GITHUB_TOKEN not configured');
  }

  // ?repo=owner/reponame  (required)
  const repoParam = (req.query.repo || '').trim();
  const parts     = repoParam.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return res
      .status(400)
      .setHeader('Content-Type', 'text/plain')
      .send('Usage: /api/stars?repo=owner/reponame&theme=light|dark');
  }

  const [owner, repo] = parts;
  const theme         = req.query.theme === 'dark' ? 'dark' : 'light';

  try {
    const history = await fetchAllStargazers(owner, repo, token);
    const svg     = generateSVG(history, theme, `${owner}/${repo}`);

    res
      .setHeader('Content-Type', 'image/svg+xml')
      .setHeader('Cache-Control', 'public, max-age=21600, stale-while-revalidate=86400')
      .status(200)
      .send(svg);
  } catch (err) {
    console.error(err);
    res.status(500).setHeader('Content-Type', 'text/plain').send(`Error: ${err.message}`);
  }
};
