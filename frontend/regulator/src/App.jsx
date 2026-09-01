import { useState } from 'react';
import { getSession, clearSession } from './auth.js';
import LoginForm from './components/LoginForm.jsx';
import RegisterForm from './components/RegisterForm.jsx';
import Dashboard from './components/Dashboard.jsx';

export default function App() {
  const [session, setSession] = useState(getSession());
  const [mode, setMode] = useState('login');

  if (session) {
    return (
      <Dashboard
        session={session}
        onLogout={() => { clearSession(); setSession(null); }}
      />
    );
  }

  return mode === 'login' ? (
    <LoginForm onLogin={setSession} onSwitchToRegister={() => setMode('register')} />
  ) : (
    <RegisterForm onRegister={setSession} onSwitchToLogin={() => setMode('login')} />
  );
}
