import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../api.js';

const homeFor = (u) => (u.role === 'admin' ? '/admin' : u.role === 'editor' ? '/editor/dashboard' : u.role === 'author' ? '/author/dashboard' : '/');

export function Login() {
  const { login } = useApp();
  const nav = useNavigate(); const loc = useLocation();
  const [f, setF] = useState({ email: '', password: '', remember: true });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setErr('Please enter a valid email address.');
    if (!f.password) return setErr('Please enter your password.');
    setBusy(true);
    try { const u = await login(f.email, f.password, f.remember); nav(loc.state?.from || homeFor(u)); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="container"><form className="card pad auth-card" onSubmit={submit} noValidate>
      <h1>Welcome back</h1>
      {err && <div className="error" role="alert">{err}</div>}
      <label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <label htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" style={{ width: 'auto' }} checked={f.remember} onChange={(e) => setF({ ...f, remember: e.target.checked })} /> Remember me</label>
      <button className="btn" style={{ width: '100%', marginTop: 12 }} disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
      <p className="small"><Link to="/forgot-password">Forgot password?</Link> · <Link to="/register">Create account</Link></p>
      <details className="small muted"><summary>Demo accounts (password: Password@123)</summary>admin@ / editor@ / author@ / john@ / reader@contenthub.dev</details>
    </form></div>
  );
}

export function Register() {
  const { register, patchUser } = useApp();
  const [file, setFile] = useState(null);
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '', confirmPassword: '', avatar: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!f.name.trim()) return setErr('Name is required.');
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setErr('Please enter a valid email address.');
    if (f.password.length < 8) return setErr('Password must be at least 8 characters.');
    if (f.password !== f.confirmPassword) return setErr('Passwords do not match.');
    setBusy(true);
    try {
      await register({ name: f.name, email: f.email, password: f.password, confirmPassword: f.confirmPassword });
      if (file) { // upload the photo now that we are logged in, then save it on the profile
        const fd = new FormData(); fd.append('file', file);
        const up = await api('/media/avatar', { method: 'POST', form: fd });
        patchUser((await api('/auth/me', { method: 'PUT', body: { avatar: up.url } })).user);
      }
      nav('/');
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const field = (k, label, type = 'text', ac) => <><label htmlFor={k}>{label}</label><input id={k} type={type} autoComplete={ac} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></>;
  return (
    <div className="container"><form className="card pad auth-card" onSubmit={submit} noValidate>
      <h1>Create your account</h1>{err && <div className="error" role="alert">{err}</div>}
      {field('name', 'Name', 'text', 'name')}{field('email', 'Email', 'email', 'email')}{field('password', 'Password (8+ characters)', 'password', 'new-password')}{field('confirmPassword', 'Confirm password', 'password', 'new-password')}
      <label htmlFor="avatar">Profile image (optional)</label><input id="avatar" type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0] || null)} />
      <button className="btn" style={{ width: '100%', marginTop: 12 }} disabled={busy}>{busy ? 'Creating…' : 'Register'}</button>
      <p className="small">Already have an account? <Link to="/login">Log in</Link></p>
    </form></div>
  );
}

export function Forgot() {
  const [email, setEmail] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const go = async (e) => { e.preventDefault(); setErr(''); try { setMsg((await api('/auth/forgot-password', { method: 'POST', body: { email } })).message + ' (In development the link is printed in the server terminal.)'); } catch (x) { setErr(x.message); } };
  return <div className="container"><form className="card pad auth-card" onSubmit={go}><h1>Forgot password</h1>{msg && <div className="success">{msg}</div>}{err && <div className="error">{err}</div>}
    <label htmlFor="e">Email</label><input id="e" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /><button className="btn" style={{ marginTop: 12 }}>Send reset link</button></form></div>;
}

export function Reset() {
  const { token } = useParams(); const nav = useNavigate();
  const [pw, setPw] = useState(''); const [err, setErr] = useState('');
  const go = async (e) => { e.preventDefault(); try { await api(`/auth/reset-password/${token}`, { method: 'POST', body: { password: pw } }); nav('/login'); } catch (x) { setErr(x.message); } };
  return <div className="container"><form className="card pad auth-card" onSubmit={go}><h1>Choose a new password</h1>{err && <div className="error">{err}</div>}
    <label htmlFor="p">New password</label><input id="p" type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} /><button className="btn" style={{ marginTop: 12 }}>Update password</button></form></div>;
}

export function Verify() {
  const { token } = useParams(); const [msg, setMsg] = useState('Verifying…');
  useEffect(() => { api(`/auth/verify/${token}`).then((j) => setMsg(j.message)).catch((e) => setMsg(e.message)); }, [token]);
  return <div className="container narrow"><h1>{msg}</h1><Link to="/">Go home</Link></div>;
}
