const { fetchFromGitHub } = require('./client');

async function getRepoDetails(owner, repo, token) {
  const repoData = await fetchFromGitHub(`/repos/${owner}/${repo}`, token);
  if (repoData.message) {
    throw new Error(`GitHub API (repo): ${repoData.message}`);
  }
  return repoData;
}

async function getStargazersPage(owner, repo, token, page) {
  const pageData = await fetchFromGitHub(
    `/repos/${owner}/${repo}/stargazers?per_page=100&page=${page}`,
    token,
    'application/vnd.github.star+json'
  );
  if (!Array.isArray(pageData)) {
    throw new Error(`GitHub API (stargazers): ${pageData.message || JSON.stringify(pageData)}`);
  }
  return pageData;
}

async function getStargazersRemainingPages(owner, repo, token, totalPages) {
  if (totalPages <= 1) {
    return [];
  }
  const pagePromises = Array.from({ length: totalPages - 1 }, (_, index) =>
    getStargazersPage(owner, repo, token, index + 2)
  );
  return Promise.all(pagePromises);
}

function buildCumulativeHistory(pages) {
  const dateCounts = {};
  for (const page of pages) {
    if (!Array.isArray(page)) {
      throw new Error(`GitHub API (page): ${page.message || JSON.stringify(page)}`);
    }
    for (const entry of page) {
      const date = (entry.starred_at || '').split('T')[0];
      if (date) {
        dateCounts[date] = (dateCounts[date] || 0) + 1;
      }
    }
  }

  let cumulative = 0;
  return Object.keys(dateCounts)
    .sort()
    .map((date) => {
      cumulative += dateCounts[date];
      return { date, cumulative };
    });
}

async function getAllStargazers(owner, repo, token) {
  const repoData = await getRepoDetails(owner, repo, token);
  const totalStargazers = repoData.stargazers_count || 0;
  
  if (totalStargazers === 0) {
    return [];
  }

  const totalPages = Math.ceil(totalStargazers / 100);
  const firstPage = await getStargazersPage(owner, repo, token, 1);
  const remainingPages = await getStargazersRemainingPages(owner, repo, token, totalPages);
  
  const allPages = [firstPage, ...remainingPages];
  return buildCumulativeHistory(allPages);
}

module.exports = {
  getAllStargazers,
};
