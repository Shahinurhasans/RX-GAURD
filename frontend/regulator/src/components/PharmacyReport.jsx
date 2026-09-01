import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function PharmacyReport() {
  const [pharmacies, setPharmacies] = useState([]);
  const [pharmacyId, setPharmacyId] = useState('');
  const [events, setEvents] = useState(null);
  const [stock, setStock] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getPharmacies()
      .then((list) => {
        setPharmacies(list);
        if (list.length > 0) setPharmacyId(list[0].pharmacyId);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function handleLoad(e) {
    e.preventDefault();
    if (!pharmacyId) return;
    setError(null);
    setLoading(true);
    try {
      const [dispensing, stockStatus] = await Promise.all([
        api.getPharmacyDispensing(pharmacyId),
        api.getPharmacyStock(pharmacyId)
      ]);
      setEvents(dispensing);
      setStock(stockStatus);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const watchOrReserveCount = events?.filter(
    (e) => e.awareCategory === 'WATCH' || e.awareCategory === 'RESERVE'
  ).length ?? 0;

  const flagged = stock?.filter((s) => s.discrepancy > 0) ?? [];

  return (
    <div>
      <h2>Pharmacy Report</h2>
      <p className="hint">
        Dispensing events and inventory reconciliation for a single pharmacy
        (&sect;7.5.3). A pharmacy's expected stock auto-decrements on every
        on-chain dispense; a positive discrepancy against their reported
        physical count means drugs left the shelf without a matching
        prescription on the chain.
      </p>

      <form onSubmit={handleLoad} className="card">
        <label>
          Pharmacy
          <select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)} required>
            {pharmacies.length === 0 && <option value="">No registered pharmacies yet</option>}
            {pharmacies.map((p) => (
              <option key={p.pharmacyId} value={p.pharmacyId}>{p.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={loading || !pharmacyId}>Load pharmacy report</button>
      </form>

      {error && <div className="error">{error}</div>}

      {stock && (
        <>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-label">Drugs tracked</div>
              <div className="stat-value">{stock.length}</div>
            </div>
            <div className={`stat-card ${flagged.length > 0 ? 'alert' : ''}`}>
              <div className="stat-label">Flagged discrepancies</div>
              <div className="stat-value">{flagged.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Dispensing events</div>
              <div className="stat-value">{events?.length ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Watch/Reserve fills</div>
              <div className="stat-value">{watchOrReserveCount}</div>
            </div>
          </div>

          <div className="card">
            <h3>Inventory reconciliation</h3>
            {flagged.length > 0 ? (
              <div className="badge warn">
                {flagged.length} drug(s) show unexplained shortfall &mdash; possible sales without prescription
              </div>
            ) : (
              <div className="badge ok">No unexplained shortfalls reported</div>
            )}
            <table>
              <thead>
                <tr><th>Drug</th><th>Received</th><th>Dispensed on-chain</th><th>Expected</th><th>Last physical count</th><th>Discrepancy</th></tr>
              </thead>
              <tbody>
                {stock.map((s) => (
                  <tr key={s.drugCode}>
                    <td>{s.drugCode.replaceAll('_', ' ')}</td>
                    <td>{s.totalReceived}</td>
                    <td>{s.totalDispensed}</td>
                    <td>{s.expectedStock}</td>
                    <td>{s.lastReportedPhysical ?? '—'}</td>
                    <td>{s.discrepancy > 0 ? <strong>{s.discrepancy}</strong> : (s.discrepancy ?? '—')}</td>
                  </tr>
                ))}
                {stock.length === 0 && (
                  <tr><td colSpan={6}>No stock records for this pharmacy yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {events && (
        <div className="card">
          <h3>Dispensing events</h3>
          <table>
            <thead>
              <tr><th>Prescription</th><th>Drug</th><th>Quantity</th><th>Category</th><th>Pharmacist</th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.prescriptionId}>
                  <td>{e.prescriptionId}</td>
                  <td>{e.drugCode.replaceAll('_', ' ')}</td>
                  <td>{e.quantity}</td>
                  <td>{e.awareCategory}</td>
                  <td>{e.pharmacistId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
