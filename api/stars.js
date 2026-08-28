const { getAllStargazers } = require('../src/github/stargazers');
const { buildChartSvg } = require('../src/chart/svg/generator');

module.exports = async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN;
  
  if (!token) {
    return res.status(500).setHeader('Content-Type', 'text/plain').send('GITHUB_TOKEN not configured');
  }

  const repoParam = (req.query.repo || '').trim();
  const parts = repoParam.split('/');
  
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return res
      .status(400)
      .setHeader('Content-Type', 'text/plain')
      .send('Usage: /api/stars?repo=owner/reponame&theme=light|dark');
  }

  const [owner, repo] = parts;
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';

  try {
    const history = await getAllStargazers(owner, repo, token);
    const svg = buildChartSvg(history, theme, `${owner}/${repo}`);

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
