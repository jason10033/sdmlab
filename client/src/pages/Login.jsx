import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '', institution: '', title: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { token, user } = mode === 'login'
        ? await api.login(form.email, form.password)
        : await api.register(form);
      localStorage.setItem('sdmlab_token', token);
      localStorage.setItem('sdmlab_user', JSON.stringify(user));
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>SDM<span style={{ color: 'var(--accent)' }}>Lab</span></h1>
        <p className="muted" style={{ textAlign: 'center' }}>Rapid development of shared decision-making tools</p>
        <div className="summary-toggle" style={{ marginTop: '.5rem' }}>
          <button className={`toggle-btn ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError(''); }}>Sign in</button>
          <button className={`toggle-btn ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setError(''); }}>Create account</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <>
              <label>Full name</label>
              <input type="text" value={form.name} onChange={set('name')} required autoFocus />
              <label>University, medical center, or clinic</label>
              <input type="text" value={form.institution} onChange={set('institution')} placeholder="e.g. Columbia University Medical Center" />
              <label>Role / title (optional)</label>
              <input type="text" value={form.title} onChange={set('title')} placeholder="e.g. MD, Health Educator" />
            </>
          )}
          <label>Email</label>
          <input type="email" value={form.email} onChange={set('email')} autoFocus={mode === 'login'} required />
          <label>Password</label>
          <input type="password" value={form.password} onChange={set('password')} required minLength={mode === 'register' ? 8 : undefined} />
          {error && <div className="error">{error}</div>}
          <div style={{ marginTop: '1rem' }}>
            <button className="btn btn-lg" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
              {busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create my account'}
            </button>
          </div>
        </form>
        <p className="muted" style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link to="/how-it-works">How SDMLab works</Link> &middot; <Link to="/repository">Browse public tools</Link>
        </p>
      </div>
    </div>
  );
}
