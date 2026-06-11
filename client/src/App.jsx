import React from 'react';
import { HashRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Projects from './pages/Projects.jsx';
import Project from './pages/Project.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Training from './pages/Training.jsx';
import PublicTool from './pages/PublicTool.jsx';
import ReviewPortal from './pages/ReviewPortal.jsx';
import Admin from './pages/Admin.jsx';

function authed() {
  return !!localStorage.getItem('sdmlab_token');
}

// When served at <slug>.sdmlab.com, show that tool directly. Reserved
// subdomains (www, app, api) and non-sdmlab.com hosts fall through to the app.
const RESERVED_SUBDOMAINS = ['www', 'app', 'api', 'sdmlab'];
function toolSlugFromHost() {
  const host = window.location.hostname;
  if (!host.endsWith('.sdmlab.com')) return null;
  const sub = host.slice(0, -'.sdmlab.com'.length);
  if (!sub || sub.includes('.') || RESERVED_SUBDOMAINS.includes(sub)) return null;
  return sub;
}

function SubdomainTool({ slug }) {
  // Render the public tool for this subdomain regardless of path.
  return <PublicTool slugOverride={slug} />;
}

function RequireAuth({ children }) {
  if (!authed()) return <Navigate to="/login" replace />;
  return children;
}

function Nav() {
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('sdmlab_user') || 'null');
  if (!authed()) return null;
  // Hide builder nav on public-facing routes
  if (location.pathname.startsWith('/t/') || location.pathname.startsWith('/review/')) return null;
  return (
    <nav className="topnav no-print">
      <Link to="/" className="brand">SDM<span>Lab</span></Link>
      <div className="navlinks">
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Projects</Link>
        <Link to="/dashboard" className={location.pathname === '/dashboard' ? 'active' : ''}>Dashboard</Link>
        <Link to="/training" className={location.pathname === '/training' ? 'active' : ''}>SDM Training</Link>
        <Link to="/admin" className={location.pathname === '/admin' ? 'active' : ''}>Team</Link>
      </div>
      <div className="navuser">
        <span>{user?.name}</span>
        <button
          className="btn btn-ghost"
          onClick={() => { localStorage.removeItem('sdmlab_token'); localStorage.removeItem('sdmlab_user'); window.location.hash = '#/login'; }}
        >Sign out</button>
      </div>
    </nav>
  );
}

export default function App() {
  const subdomainSlug = toolSlugFromHost();
  if (subdomainSlug) {
    return (
      <HashRouter>
        <SubdomainTool slug={subdomainSlug} />
      </HashRouter>
    );
  }
  return (
    <HashRouter>
      <Nav />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/t/:slug" element={<PublicTool />} />
        <Route path="/review/:token" element={<ReviewPortal />} />
        <Route path="/" element={<RequireAuth><Projects /></RequireAuth>} />
        <Route path="/project/:id" element={<RequireAuth><Project /></RequireAuth>} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/training" element={<RequireAuth><Training /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
