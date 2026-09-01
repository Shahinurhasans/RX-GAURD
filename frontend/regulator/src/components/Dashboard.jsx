import { useState } from 'react';
import Overview from './Overview.jsx';
import PharmacyReport from './PharmacyReport.jsx';
import Prescribers from './Prescribers.jsx';
import AuditTrail from './AuditTrail.jsx';

const TABS = [
  { key: 'overview', label: 'Overview', Component: Overview },
  { key: 'pharmacies', label: 'Pharmacy Report', Component: PharmacyReport },
  { key: 'prescribers', label: 'Prescribers', Component: Prescribers },
  { key: 'audit', label: 'Audit Trail', Component: AuditTrail }
];

export default function Dashboard({ session, onLogout }) {
  const [tab, setTab] = useState('overview');
  const Active = TABS.find((t) => t.key === tab).Component;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">&#128737;</span>
          <span>
            Rx-Guard
            <span className="sub">Regulator Console</span>
          </span>
        </div>
        <div className="session-chip">
          <span>{session.name} &middot; {session.agency || 'DGDA'}</span>
          <button onClick={onLogout}>Log out</button>
        </div>
      </header>

      <nav className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        <Active />
      </main>
    </div>
  );
}
