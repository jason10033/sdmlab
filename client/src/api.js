const BASE = '/api';

function token() {
  return localStorage.getItem('sdmlab_token');
}

async function req(method, path, body, isForm = false) {
  const headers = {};
  if (token()) headers.Authorization = `Bearer ${token()}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    localStorage.removeItem('sdmlab_token');
    localStorage.removeItem('sdmlab_user');
    window.location.hash = '#/login';
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  // Auth
  login: (email, password) => req('POST', '/auth/login', { email, password }),
  register: (d) => req('POST', '/auth/register', d),
  logout: () => req('POST', '/auth/logout'),
  me: () => req('GET', '/auth/me'),
  updateProfile: (d) => req('PUT', '/auth/profile', d),
  users: () => req('GET', '/auth/users'),
  addUser: (d) => req('POST', '/auth/users', d),
  changePassword: (password) => req('POST', '/auth/change-password', { password }),
  health: () => req('GET', '/health'),

  // Repository + fork + publish + maintenance
  getRepository: () => req('GET', '/repository'),
  getRepoMeta: () => req('GET', '/repository/meta'),
  forkTool: (slug) => req('POST', `/repository/${slug}/fork`),
  signoff: (id, note) => req('POST', `/projects/${id}/signoff`, { note }),
  publish: (id, d) => req('POST', `/projects/${id}/publish`, d),
  unpublish: (id) => req('POST', `/projects/${id}/unpublish`),

  // Site admin
  adminOverview: () => req('GET', '/admin/overview'),

  // Projects + lifecycle
  getProjects: () => req('GET', '/projects'),
  createProject: (d) => req('POST', '/projects', d),
  getProject: (id) => req('GET', `/projects/${id}`),
  updateProject: (id, d) => req('PUT', `/projects/${id}`, d),
  deleteProject: (id) => req('DELETE', `/projects/${id}`),
  setStage: (id, d) => req('POST', `/projects/${id}/stage`, d),
  getRevisions: (id) => req('GET', `/projects/${id}/revisions`),
  saveInterview: (id, answers) => req('PUT', `/projects/${id}/interview`, answers),

  // Materials
  getMaterials: (id) => req('GET', `/projects/${id}/materials`),
  addMaterialUrl: (id, url) => req('POST', `/projects/${id}/materials/url`, { url }),
  addMaterialText: (id, label, text) => req('POST', `/projects/${id}/materials/text`, { label, text }),
  addMaterialFile: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return req('POST', `/projects/${id}/materials/file`, form, true);
  },
  deleteMaterial: (id, mid) => req('DELETE', `/projects/${id}/materials/${mid}`),

  // Evidence + Reddit
  getEvidence: (id) => req('GET', `/projects/${id}/evidence`),
  scanEvidence: (id) => req('POST', `/projects/${id}/evidence/scan`),
  scanStatus: (id) => req('GET', `/projects/${id}/evidence/scan/status`),
  setEvidenceStatus: (id, eid, status) => req('PATCH', `/projects/${id}/evidence/${eid}`, { status }),
  discoverReddit: (id) => req('POST', `/projects/${id}/reddit/discover`),
  getSubreddits: (id) => req('GET', `/projects/${id}/subreddits`),
  setSubreddit: (id, sid, approved) => req('PATCH', `/projects/${id}/subreddits/${sid}`, { approved }),

  // Generation + versions
  generate: (id) => req('POST', `/projects/${id}/generate`),
  generateStatus: (id) => req('GET', `/projects/${id}/generate/status`),
  getVersions: (id) => req('GET', `/projects/${id}/versions`),
  getLatestVersion: (id) => req('GET', `/projects/${id}/versions/latest`),
  saveVersion: (id, d) => req('POST', `/projects/${id}/versions`, d),

  addPmid: (id, pmid) => req('POST', `/projects/${id}/evidence/pmid`, { pmid }),
  addSubreddit: (id, name) => req('POST', `/projects/${id}/subreddits`, { name }),
  getVersion: (id, v) => req('GET', `/projects/${id}/versions/${v}`),
  restoreVersion: (id, v) => req('POST', `/projects/${id}/versions/${v}/restore`),
  getAnalytics: (id) => req('GET', `/projects/${id}/analytics`),

  // Evaluations
  createInvites: (id, d) => req('POST', `/projects/${id}/invites`, d),
  getInvites: (id) => req('GET', `/projects/${id}/invites`),
  getFeedback: (id) => req('GET', `/projects/${id}/feedback`),
  getReview: (tok) => req('GET', `/review/${tok}`),
  submitReview: (tok, d) => req('POST', `/review/${tok}`, d),

  // Public tool
  getPublicTool: (slug) => req('GET', `/public/tool/${slug}`),
  publicEvent: (slug, event) => req('POST', `/public/tool/${slug}/event`, { event }),
  publicFeedback: (slug, d) => req('POST', `/public/tool/${slug}/feedback`, d),
  publicEvaluation: (slug, d) => req('POST', `/public/tool/${slug}/evaluation`, d),

  // Surveillance dashboard
  getDashboard: () => req('GET', '/surveillance'),
  setSurveillanceStatus: (itemId, status) => req('PATCH', `/surveillance/items/${itemId}`, { status }),
  setFeedbackStatus: (fid, status) => req('PATCH', `/surveillance/feedback/${fid}`, { status }),
  runSurveillance: () => req('POST', '/surveillance/run'),
  surveillanceRunStatus: () => req('GET', '/surveillance/run/status'),
};

// Start a surveillance run and resolve when it finishes (polls the job).
export async function runSurveillanceAndWait() {
  await api.runSurveillance();
  for (;;) {
    await new Promise((r) => setTimeout(r, 4000));
    const s = await api.surveillanceRunStatus();
    if (s.status === 'done') return s.results;
    if (s.status === 'error') throw new Error(s.error);
  }
}

// Authenticated file download (exports). Fetches with the Bearer token and
// triggers a browser download.
export async function downloadExport(path, filename) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
