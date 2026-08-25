import React, { useState } from 'react';
import Button from './ui/Button';
import { api } from '../api';

interface LoginPageProps {
  onLogin: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>🐒 Media Monkey</h1>
        <p className="mm-muted">Enter your password to continue.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          className="login-input"
        />
        {error && <p style={{ color: '#e55', margin: '0.25rem 0 0' }}>{error}</p>}
        <Button type="submit" variant="primary" disabled={busy || !password} style={{ marginTop: '0.75rem' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
};

export default LoginPage;
