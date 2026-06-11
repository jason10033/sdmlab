// Reddit client. Reddit blocks anonymous JSON access, so this uses the official
// OAuth application-only flow. Create a free "script" app at
// https://www.reddit.com/prefs/apps and set REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET.
const UA = 'SDMLab/0.1 clinical decision aid surveillance (read-only)';

let cachedToken = null; // { token, expiresAt }

function credsMissingError() {
  const err = new Error(
    'Reddit requires API credentials. Create a free app at reddit.com/prefs/apps (type: script), then set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in server/.env.'
  );
  err.code = 'NO_REDDIT_CREDS';
  return err;
}

async function getToken() {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) throw credsMissingError();
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) return cachedToken.token;

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Reddit auth failed (${res.status}). Check REDDIT_CLIENT_ID/SECRET.`);
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

async function redditGet(path) {
  const token = await getToken();
  const res = await fetch(`https://oauth.reddit.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`Reddit request failed (${res.status})`);
  return res.json();
}

// Find candidate communities for a clinical decision.
async function findSubreddits(query, limit = 12) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const data = await redditGet(`/subreddits/search?${params}`);
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
  const data = await redditGet(`/r/${subreddit}/search?${params}`);
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

function redditConfigured() {
  return !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

module.exports = { findSubreddits, searchSubreddit, redditConfigured };
