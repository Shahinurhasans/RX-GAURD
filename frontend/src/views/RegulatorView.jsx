import { useState } from 'react';
import { api } from '../api.js';

export default function RegulatorView() {
  const [pharmacyId, setPharmacyId] = useState('pharmacy-dhanmondi-01');
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleLoad(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.getPharmacyDispensing(pharmacyId.trim());
      setEvents(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const watchOrReserveCount = events?.filter(
    (e) => e.awareCategory === 'WATCH' || e.awareCategory === 'RESERVE'
  ).length ?? 0;

  return (
    <section>
      <h2>Regulator &mdash; Dispensing Aggregation</h2>
      <p className="hint">
        DGDA-style view over aggregated dispensing events per pharmacy (&sect;7.5.3).
        In production this reads from the off-chain analytics service over hashed,
        chain-anchored aggregates; the prototype queries the ledger's composite-key
        index directly for the same pharmacy/week bucketing.
      </p>

      <form onSubmit={handleLoad} className="card">
        <label>
          Pharmacy ID
          <input value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)} required />
        </label>
        <button type="submit" disabled={loading}>Load dispensing events</button>
      </form>

      {error && <div className="error">{error}</div>}

      {events && (
        <div className="card result">
          <p>{events.length} dispensing event(s) &middot; {watchOrReserveCount} Watch/Reserve category</p>
          <table>
            <thead>
              <tr><th>Prescription</th><th>Drug</th><th>Category</th><th>Pharmacist</th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.prescriptionId}>
                  <td>{e.prescriptionId}</td>
                  <td>{e.drugCode.replaceAll('_', ' ')}</td>
                  <td>{e.awareCategory}</td>
                  <td>{e.pharmacistId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
