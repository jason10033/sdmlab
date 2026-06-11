import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Admin() {
  const me = JSON.parse(localStorage.getItem('sdmlab_user') || 'null');
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [profile, setProfile] = useState({ name: '', institution: '', title: '' });

  const load = useCallback(async () => {
    setUsers(await api.users());
    const me = (await api.me()).user;
    setProfile({ name: me.name || '', institution: me.institution || '', title: me.title || '' });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveProfile(e) {
    e.preventDefault();
    setError(''); setMsg('');
    try { await api.updateProfile(profile); setMsg('Profile saved.'); await load(); }
    catch (err) { setError(err.message); }
  }

  async function addUser(e) {
    e.preventDefault();
    setError(''); setMsg('');
    try {
      await api.addUser(form);
      setForm({ name: '', email: '', password: '' });
      setMsg('Account created.');
      await load();
    } catch (err) { setError(err.message); }
  }

  async function changePassword(e) {
    e.preventDefault();
    setError(''); setMsg('');
    try {
      await api.changePassword(pw);
      setPw('');
      setMsg('Your password was changed.');
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page page-narrow">
      <h1>Team settings</h1>
      {msg && <div className="success">{msg}</div>}
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h3>My profile</h3>
        <form onSubmit={saveProfile}>
          <label>Full name</label>
          <input type="text" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          <label>University, medical center, or clinic</label>
          <input type="text" value={profile.institution} onChange={(e) => setProfile({ ...profile, institution: e.target.value })} />
          <label>Role / title</label>
          <input type="text" value={profile.title} onChange={(e) => setProfile({ ...profile, title: e.target.value })} />
          <div style={{ marginTop: '.6rem' }}><button className="btn btn-secondary">Save profile</button></div>
        </form>
      </div>

      <div className="card">
        <h3>Change my password</h3>
        <form onSubmit={changePassword}>
          <label>New password (at least 8 characters)</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required />
          <div style={{ marginTop: '.6rem' }}>
            <button className="btn btn-secondary">Change password</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Team accounts</h3>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Added</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td><td>{u.email}</td><td>{u.role}</td>
                <td className="muted">{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {me?.role === 'admin' && (
        <div className="card">
          <h3>Add a team member</h3>
          <form onSubmit={addUser}>
            <label>Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <label>Temporary password (they should change it after first login)</label>
            <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required />
            <div style={{ marginTop: '.6rem' }}>
              <button className="btn">Create account</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
