import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { token, user } = await api.login(email, password);
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
        <form onSubmit={submit}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <div className="error">{error}</div>}
          <div style={{ marginTop: '1rem' }}>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
