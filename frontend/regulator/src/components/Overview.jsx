import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Overview() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    setError(null);
    api.getNationalSummary()
      .then(setSummary)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  if (loading) return <p className="hint">Loading national summary…</p>;
  if (error) return <div className="error">{error}</div>;
  if (!summary) return null;

  const { pharmacyCount, totalDispensingEvents, awareCounts, pharmacyReports } = summary;
  const awareTotal = awareCounts.ACCESS + awareCounts.WATCH + awareCounts.RESERVE;
  const pct = (n) => (awareTotal > 0 ? Math.round((n / awareTotal) * 100) : 0);
  const needsInvestigation = pharmacyReports.filter((p) => p.totalDiscrepancy > 0);

  return (
    <div>
      <h2>National Overview</h2>
      <p className="hint">
        Aggregated across every registered pharmacy &mdash; the single-screen
        view of national antimicrobial dispensing and inventory integrity
        (whitepaper &sect;7.5.3).
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Pharmacies</div>
          <div className="stat-value">{pharmacyCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Dispensing events</div>
          <div className="stat-value">{totalDispensingEvents}</div>
        </div>
        <div className={`stat-card ${needsInvestigation.length > 0 ? 'alert' : ''}`}>
          <div className="stat-label">Need investigation</div>
          <div className="stat-value">{needsInvestigation.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Watch + Reserve share</div>
          <div className="stat-value">{pct(awareCounts.WATCH) + pct(awareCounts.RESERVE)}%</div>
        </div>
      </div>

      <div className="card">
        <h3>National AWaRe mix</h3>
        <p style={{ margin: 0 }}>
          Access {pct(awareCounts.ACCESS)}% &middot; Watch {pct(awareCounts.WATCH)}% &middot; Reserve {pct(awareCounts.RESERVE)}%
          <span className="hint"> ({awareTotal} total fills)</span>
        </p>
      </div>

      <div className="card">
        <h3>Pharmacies ranked by unexplained shortfall</h3>
        {needsInvestigation.length > 0 ? (
          <div className="badge warn">
            {needsInvestigation.length} pharmacy(ies) show drugs leaving the shelf without a matching prescription
          </div>
        ) : (
          <div className="badge ok">No pharmacy shows an unexplained shortfall</div>
        )}
        <table>
          <thead>
            <tr><th>Pharmacy</th><th>Dispensing events</th><th>Flagged drugs</th><th>Total shortfall</th></tr>
          </thead>
          <tbody>
            {pharmacyReports.map((p) => (
              <tr key={p.pharmacyId}>
                <td>{p.name}</td>
                <td>{p.dispensingEvents}</td>
                <td>{p.flaggedDrugs}</td>
                <td>{p.totalDiscrepancy > 0 ? <strong>{p.totalDiscrepancy}</strong> : p.totalDiscrepancy}</td>
              </tr>
            ))}
            {pharmacyReports.length === 0 && (
              <tr><td colSpan={4}>No pharmacies registered yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
