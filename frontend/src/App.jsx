import { NavLink, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import PrescriberView from './views/PrescriberView.jsx';
import PharmacistView from './views/PharmacistView.jsx';
import PublicVerifyView from './views/PublicVerifyView.jsx';
import RegulatorView from './views/RegulatorView.jsx';
import LoginView from './views/LoginView.jsx';
import RegisterDoctorView from './views/RegisterDoctorView.jsx';
import RegisterPharmacyView from './views/RegisterPharmacyView.jsx';
import RegisterRegulatorView from './views/RegisterRegulatorView.jsx';
import { getSession, clearSession } from './auth.js';

function roleHome(role) {
  if (role === 'doctor') return '/prescriber';
  if (role === 'pharmacy') return '/pharmacist';
  if (role === 'regulator') return '/regulator';
  return '/login';
}

function RequireRole({ role, children }) {
  const session = getSession();
  if (!session || session.role !== role) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  const session = getSession();
  const navigate = useNavigate();

  function handleLogout() {
    clearSession();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Rx-Guard</h1>
        <nav>
          {session?.role === 'doctor' && <NavLink to="/prescriber" className={navClass}>Prescriber</NavLink>}
          {session?.role === 'pharmacy' && <NavLink to="/pharmacist" className={navClass}>Pharmacist</NavLink>}
          <NavLink to="/verify" className={navClass}>Public Verify</NavLink>
          {session?.role === 'regulator' && <NavLink to="/regulator" className={navClass}>Regulator</NavLink>}
        </nav>
        <div className="session">
          {session ? (
            <>
              <span className="hint">{session.name} &middot; {session.role}</span>
              <button onClick={handleLogout}>Log out</button>
            </>
          ) : (
            <NavLink to="/login" className={navClass}>Log in</NavLink>
          )}
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to={roleHome(session?.role)} replace />} />
          <Route path="/login" element={<LoginView />} />
          <Route path="/register/doctor" element={<RegisterDoctorView />} />
          <Route path="/register/pharmacy" element={<RegisterPharmacyView />} />
          <Route path="/register/regulator" element={<RegisterRegulatorView />} />
          <Route path="/prescriber" element={<RequireRole role="doctor"><PrescriberView /></RequireRole>} />
          <Route path="/pharmacist" element={<RequireRole role="pharmacy"><PharmacistView /></RequireRole>} />
          <Route path="/verify" element={<PublicVerifyView />} />
          <Route path="/regulator" element={<RequireRole role="regulator"><RegulatorView /></RequireRole>} />
        </Routes>
      </main>
    </div>
  );
}

function navClass({ isActive }) {
  return isActive ? 'active' : '';
}
