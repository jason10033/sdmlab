// Reddit public JSON endpoints. Read-only, low volume, identified User-Agent per Reddit API rules.
const UA = 'SDMLab/0.1 (clinical decision aid surveillance; contact admin)';

async function redditGet(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Reddit request failed (${res.status})`);
  return res.json();
}

// Find candidate communities for a clinical decision.
async function findSubreddits(query, limit = 12) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const data = await redditGet(`https://www.reddit.com/subreddits/search.json?${params}`);
  return (data.data?.children || []).map((c) => ({
    name: c.data.display_name,
    title: c.data.title,
    description: (c.data.public_description || '').slice(0, 400),
    subscribers: c.data.subscribers || 0,
    over18: !!c.data.over18,
  }));
}

// Recent posts in a subreddit matching a query.
async function searchSubreddit(subreddit, query, { limit = 15, time = 'month' } = {}) {
  const params = new URLSearchParams({
    q: query, restrict_sr: '1', sort: 'new', t: time, limit: String(limit),
  });
  const data = await redditGet(`https://www.reddit.com/r/${subreddit}/search.json?${params}`);
  return (data.data?.children || []).map((c) => ({
    id: c.data.id,
    subreddit: c.data.subreddit,
    title: c.data.title,
    selftext: (c.data.selftext || '').slice(0, 1500),
    score: c.data.score,
    numComments: c.data.num_comments,
    createdUtc: c.data.created_utc,
    url: `https://www.reddit.com${c.data.permalink}`,
  }));
}

module.exports = { findSubreddits, searchSubreddit };
