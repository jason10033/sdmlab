// PubMed E-utilities client. Abstract-level only; no API key required at low volume.
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&amp;/g, '&');
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extract(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : '';
}

async function fetchByIds(ids) {
  if (!ids.length) return [];
  const fetchRes = await fetch(`${EUTILS}/efetch.fcgi?db=pubmed&retmode=xml&rettype=abstract&id=${ids.join(',')}`);
  if (!fetchRes.ok) throw new Error(`PubMed fetch failed (${fetchRes.status})`);
  const xml = await fetchRes.text();
  return parseArticles(xml);
}

function parseArticles(xml) {
  const articles = [];
  const chunks = xml.split('<PubmedArticle>').slice(1);
  for (const chunk of chunks) {
    const pmid = stripTags(extract(chunk, 'PMID'));
    const title = stripTags(extract(chunk, 'ArticleTitle'));
    const abstractParts = [...chunk.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)]
      .map((m) => stripTags(m[1]));
    const journal = stripTags(extract(chunk, 'Title'));
    const year = stripTags(extract(extract(chunk, 'PubDate'), 'Year')) ||
      (stripTags(extract(chunk, 'PubDate')).match(/\d{4}/) || [''])[0];
    if (!pmid || !title) continue;
    articles.push({
      pmid,
      title,
      abstract: abstractParts.join(' '),
      journal,
      year,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    });
  }
  return articles;
}

async function search(query, { retmax = 25, mindate = null } = {}) {
  const params = new URLSearchParams({
    db: 'pubmed', term: query, retmode: 'json', retmax: String(retmax), sort: 'relevance',
  });
  if (mindate) {
    params.set('datetype', 'pdat');
    params.set('mindate', mindate); // YYYY/MM/DD
    params.set('maxdate', '3000');
    params.set('sort', 'date');
  }
  const res = await fetch(`${EUTILS}/esearch.fcgi?${params}`);
  if (!res.ok) throw new Error(`PubMed search failed (${res.status})`);
  const data = await res.json();
  const ids = data.esearchresult?.idlist || [];
  if (ids.length === 0) return [];

  return fetchByIds(ids);
}

module.exports = { search, fetchByIds };
