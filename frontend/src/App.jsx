import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import PrescriberView from './views/PrescriberView.jsx';
import PharmacistView from './views/PharmacistView.jsx';
import PublicVerifyView from './views/PublicVerifyView.jsx';
import RegulatorView from './views/RegulatorView.jsx';

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Rx-Guard</h1>
        <nav>
          <NavLink to="/prescriber" className={navClass}>Prescriber</NavLink>
          <NavLink to="/pharmacist" className={navClass}>Pharmacist</NavLink>
          <NavLink to="/verify" className={navClass}>Public Verify</NavLink>
          <NavLink to="/regulator" className={navClass}>Regulator</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/prescriber" replace />} />
          <Route path="/prescriber" element={<PrescriberView />} />
          <Route path="/pharmacist" element={<PharmacistView />} />
          <Route path="/verify" element={<PublicVerifyView />} />
          <Route path="/regulator" element={<RegulatorView />} />
        </Routes>
      </main>
    </div>
  );
}

function navClass({ isActive }) {
  return isActive ? 'active' : '';
}
