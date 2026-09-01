# Rx-Guard — Prototype

Blockchain + AI antimicrobial stewardship platform for community pharmacies in
Bangladesh. This repository is the BCOLBD 2026 Final Round prototype
accompanying the Rx-Guard whitepaper.

## What this prototype demonstrates

The whitepaper describes a national-scale Hyperledger Fabric consortium
network with seven categories of anchor node (DGDA, BMDC, ICDDR,B, hospital
chains, pharmacy federations, academia, donors — whitepaper §7.3) plus a
public EVM mirror chain for citizen verification. This prototype demonstrates
the **verification mechanism** the whitepaper depends on, at pilot scale, on
the Hyperledger Fabric `test-network` (two peer organisations + one orderer +
Fabric CA), which stands in for that seven-category anchor set. Every
component maps directly onto a section of the whitepaper:

| Component | Whitepaper section | What it does |
|---|---|---|
| `chaincode/rxguard` | §7.5.1–7.5.3 | Prescription issuance, dispensing verification, stock reconciliation, regulator aggregation, on a permissioned Fabric channel |
| `ai-service/` | §7.6.1 | Trained appropriateness classifier (WHO AWaRe category + score) queried at the point of prescription |
| `backend/` | §7.5 | Express API bridging the front-end to the Fabric Gateway and the AI service |
| `frontend/doctor` | §4.1 | Standalone prescriber portal |
| `frontend/pharmacy` | §4.2 | Standalone pharmacy portal (verify, dispense, inventory) |
| `frontend/regulator` | §4.3 | Standalone DGDA-style regulator console |
| `frontend/verify` | §7.2 | Standalone public verification page (no login) |

### On-chain vs off-chain (whitepaper §7.4)

No patient name, NID, or diagnosis text is ever written to the chain. The
front-end only ever sends a `patientHash` computed by the issuing facility;
the chaincode stores the hash, drug code, dose, duration, AWaRe category, AI
appropriateness score, and model version hash — matching whitepaper Table 7.4
exactly.

## Repository layout

```
chaincode/rxguard/   Fabric contract (fabric-contract-api, Node.js)
ai-service/          Appropriateness classifier: train.py, service.py (FastAPI)
backend/             Express API + Fabric Gateway client
frontend/doctor/     Standalone Vite app — prescriber portal (port 5173)
frontend/pharmacy/   Standalone Vite app — pharmacy portal (port 5174)
frontend/regulator/  Standalone Vite app — regulator console (port 5175)
frontend/verify/     Standalone Vite app — public verification, no login (port 5176)
scripts/             Network bring-up and deployment helper scripts
docs/                Architecture notes, sequence diagrams
fabric-samples/      Hyperledger Fabric test-network (not our code; gitignored)
```

Each `frontend/*` app is an independent Vite project with its own
`package.json`, login/registration flow, and visual identity — there is no
shared router or nav between them, matching how a doctor's clinic app, a
pharmacy's point-of-sale integration, a government oversight console, and a
public verification page would realistically be separate products. They
share only the shape of a small API client (`src/api.js`) and JWT session
helper (`src/auth.js`), duplicated per app rather than published as a shared
package, since the four are meant to evolve independently.

## Running the prototype end-to-end

Prerequisites: Docker (Linux containers — on Windows this must run inside
WSL2, see `docs/WINDOWS_SETUP.md`), Node.js 18+, Python 3.10+.

```bash
# 1. Bring up the Fabric test network, create the channel, deploy chaincode
./scripts/network-up.sh

# 2. Train (or retrain) the AI appropriateness model and start the service
cd ai-service
python -m venv .venv && .venv/bin/pip install -r requirements.txt
python generate_data.py && python finetune_biobert.py
uvicorn service:app --port 8001 &

# 3. Start the backend API (talks to Fabric + the AI service)
cd ../backend
npm install
npm start   # http://localhost:4000

# 4. Start each front-end (separate terminals/ports)
cd ../frontend/doctor    && npm install && npm run dev   # http://localhost:5173
cd ../frontend/pharmacy  && npm install && npm run dev   # http://localhost:5174
cd ../frontend/regulator && npm install && npm run dev   # http://localhost:5175
cd ../frontend/verify    && npm install && npm run dev   # http://localhost:5176
```

Register a doctor at `:5173`, a pharmacy at `:5174`, and a regulator at
`:5175` (doctor registration writes a prescriber record onto the ledger,
whitepaper §7.5.1). Each app only accepts login for its own role — a doctor
account is rejected on the pharmacy portal and vice versa — and
prescriberId/pharmacyId/pharmacistId come from the logged-in session, never
a free-text field. Issue a prescription on `:5173` (including a quantity —
number of units/tablets, also written on-chain), copy the prescription ID
(or scan the QR), and verify/dispense it on `:5174`. `:5176` is the
patient-facing check, no login needed. `:5175` shows the aggregated
dispensing and stock-discrepancy view across pharmacies.

A pharmacy account can also log stock receipts and physical audit counts on
`:5174` — every on-chain dispense auto-decrements the pharmacy's expected
stock by the prescribed quantity, so a shortfall against what's physically
counted flags possible sales made without a matching prescription (visible
to regulators on `:5175`).

The regulator console (`:5175`) has four tabs:
- **Overview** — a national summary across every pharmacy: AWaRe mix,
  total dispensing events, and pharmacies ranked by unexplained shortfall.
- **Pharmacy Report** — the per-pharmacy dispensing + stock reconciliation
  view (unchanged from before).
- **Prescribers** — revoke a doctor's licence. This writes to the ledger
  immediately; that doctor's next `IssuePrescription` attempt is rejected
  network-wide, with no phone call or email needed to notify pharmacies.
- **Audit Trail** — look up a prescription ID to see its full immutable
  transaction history (issued, dispensed, each with its own transaction ID
  and timestamp) — demonstrates that no party, including DGDA itself, can
  edit or delete a past record.

## Known scope reductions vs. the whitepaper (documented deliberately)

- **Two orgs, not seven.** The pilot network's `Org1MSP`/`Org2MSP` each carry
  multiple whitepaper-defined roles (see comment in
  `chaincode/rxguard/lib/rxGuardContract.js`) so the demo runs on Fabric's
  stock two-org test-network. Production onboarding maps roles to BMDC/DGDA
  issued certificate attributes instead of org membership.
- **Pharmacy and regulator accounts are an off-chain directory, not a ledger
  record.** Doctor accounts map 1:1 onto an on-chain `RegisterPrescriber`
  entry, so a revoked prescriber loses issuance rights network-wide. Pharmacy
  and regulator accounts exist only in the backend's local user store
  (`backend/data/users.json`) — the actual dispensing/query authorization is
  enforced by Fabric organisation membership (PharmacyOrgMSP / Org1MSP), and
  this store just gives staff a login and ties actions to a stable identity.
  A production version would register pharmacies and regulator staff on-chain
  too, with per-pharmacist granularity.
- **Stock discrepancy detection is a self-reported signal, not an audit
  trail.** A pharmacy logs its own receipts and physical counts — nothing
  stops a pharmacy from under-reporting a physical count discrepancy just as
  easily as it could under-report on paper today. What the chain adds is that
  the *expected* count (drawn down by every real prescription fill) can't be
  faked, so a pharmacy that wants to hide leakage has to also fabricate a
  matching physical count every audit, and every one of those audit
  submissions is itself timestamped and immutable — unlike a paper ledger.
- **Signatures are placeholders.** `prescriberSignature` / `pharmacistSignature`
  fields are populated with a deterministic string, not a real detached
  ECDSA signature from a mobile-held key, for time reasons — the chaincode's
  authorization (§8.2 permission structure) is enforced via MSP identity on
  the mutual-TLS gRPC connection, which is the same underlying primitive.
- **No public EVM mirror chain.** `/verify` queries the Fabric network
  directly rather than through a Polygon mirror with a merkle proof (§7.2);
  the response shape (boolean + category only) mimics what the mirror would
  expose.
- **AI model is PubMedBERT fine-tuned on a synthetic dataset**, not the
  ICDDR,B-labelled clinical data described in §7.6.1 — see `ai-service/README.md`
  for what a production version would require (real labelled data, model registry,
  federated aggregation per §7.7).
