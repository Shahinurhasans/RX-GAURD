# Rx-Guard prototype — architecture notes

Companion to the whitepaper's §7 (System Architecture). This document answers
the specific questions the BCOLBD prototype rubric asks for (consensus setup,
on/off-chain data, legacy-system integration, data model, digital identity,
privacy/security, governance hooks) and reflects the system as actually
built, not just as planned.

## Consensus / network setup

Hyperledger Fabric `test-network` topology, unchanged from the fabric-samples
default:

- **Orderer**: single `etcdraft` node, `orderer.example.com` (whitepaper's
  production design spreads ordering across 3+ institutions per §8.4 — the
  pilot's single-node orderer is a scope reduction for demo purposes only).
- **Org1 (`Org1MSP`)**: one peer, `peer0.org1.example.com`. Stands in for the
  Prescriber/professional-body/regulator anchor categories in whitepaper §7.3
  during the pilot (see role-mapping comment in the chaincode).
- **Org2 (`Org2MSP`)**: one peer, `peer0.org2.example.com`. Stands in for the
  pharmacy federation anchor category.
- **Channel**: `mychannel`, endorsement policy requires both orgs (Fabric
  test-network default `AND('Org1MSP.peer','Org2MSP.peer')`), which is exactly
  the multi-party endorsement whitepaper §2.4 argues is the point of using a
  blockchain here — neither the prescriber org nor the pharmacy org can
  unilaterally commit a dispensing event.
- **Identity**: Fabric CA per org (`ca_org1`, `ca_org2`, `ca_orderer`), so
  every submitted transaction carries an X.509 identity signed by that org's
  CA — this is the base "digital identity system" the rubric asks about; see
  **Two-layer identity** below for how it's paired with application accounts.
- **Chaincode**: `rxguard`, currently deployed at version 1.0, sequence 5 —
  five upgrades since the initial deploy, each adding a capability described
  below (stock reconciliation, prescriber-history indexing, etc.) without
  breaking existing ledger state, demonstrating Fabric's chaincode lifecycle
  in practice rather than just in theory.

## Two-layer identity: Fabric MSP + application accounts

A real deployment needs both a network-membership layer (who's allowed to
transact at all) and an application layer (who is this specific person, and
what can they see in the UI). Rx-Guard implements both, deliberately kept
separate:

- **Fabric MSP identity** is the authoritative layer. `chaincode/rxguard/lib/rxGuardContract.js`'s
  `_requireRole()` reads `ctx.clientIdentity.getMSPID()` on every state-changing
  call — a transaction submitted with a `PharmacyOrgMSP` (Org2) identity
  physically cannot invoke `IssuePrescription`, regardless of what the
  application layer above it claims. This is enforced by the peers that
  endorse the transaction, not by application code that could be bypassed.
- **Application accounts** (backend `/api/auth/*`) are a JWT-based login
  layer on top, giving each doctor/pharmacy/regulator a personal identity
  (email + password) instead of everyone sharing one org-level demo
  identity. A doctor account maps 1:1 onto an on-chain `RegisterPrescriber`
  record (see below); pharmacy and regulator accounts exist only in the
  backend's local store (`backend/data/users.json`, bcrypt-hashed passwords)
  since their chain-level authorization already comes from Fabric org
  membership. `backend/src/auth/index.js` issues and verifies the JWTs;
  `requireRole(role)` middleware gates each API route.
- Why both: the JWT layer is what makes "a prescriber cannot dispense and a
  pharmacy cannot issue" true *in the product*, at the granularity of an
  individual doctor rather than a whole organisation; the MSP layer is what
  makes it true *cryptographically*, and is what actually gets endorsed and
  written to the ledger.

## On-chain vs off-chain data

See the table in the root `README.md` and whitepaper Table 7.4. Enforced in
code: `IssuePrescription` takes a `patientHash` parameter, never a name or
NID — there is no code path in this repository that can write
patient-identifying data to the ledger.

## Data model

State stored in the Fabric world state, by asset type:

- **`prescriber`** (composite key `PRESCRIBER\x00<prescriberId>`) —
  registration status, issuing professional body, active/revoked flag and
  reason. Written by `RegisterPrescriber`, mutated by `RevokePrescriber`,
  read by `GetPrescriber`.
- **`prescription`** (plain key `<prescriptionId>`) — full lifecycle record
  (`ISSUED -> FILLED | EXPIRED`), including `quantity` (units/tablets — added
  so inventory reconciliation tracks actual medicine amounts, not just fill
  counts) and `appropriatenessScore`. See the contract for the exact field
  list.
- **`PRESCRIBER_RX` composite-key index** (`PRESCRIBER_RX\x00<prescriberId>\x00<prescriptionId>`) —
  a lightweight record (drug, category, score, timestamp) written alongside
  every successful issuance, letting `GetPrescriptionsForPrescriber` range-query
  a doctor's issuance history without scanning the whole ledger. This is what
  powers the regulator console's low-appropriateness-score pattern flag.
- **`DISPENSE` composite-key index** (`DISPENSE\x00<pharmacyId>\x00<weekBucket>\x00<prescriptionId>`) —
  lets the regulator range-query dispensing volume per pharmacy per week
  without a second database (whitepaper §7.5.3's aggregation flow).
- **`STOCK` composite-key index** (`STOCK\x00<pharmacyId>\x00<drugCode>`) —
  inventory reconciliation record: `totalReceived` (from `RecordStockReceipt`),
  `totalDispensed`/`expectedStock` (auto-decremented by `DispensePrescription`
  on every fill, by the prescribed quantity), `lastReportedPhysical` and
  `discrepancy` (from `ReportStockAudit`). A positive discrepancy — expected
  stock higher than what a physical count found — is the on-chain signal for
  medicine leaving a pharmacy without a matching prescription.

All four composite-key index types use Fabric's native
`getStateByPartialCompositeKey`, avoiding any off-chain indexing service.

## AI appropriateness scoring and its enforcement boundary

`ai-service/` (FastAPI) serves a fine-tuned `microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext`
transformer (`ai-service/finetune_biobert.py`; 94% held-out accuracy) that
scores a `{diagnosis, drug}` pair before every issuance. What matters
architecturally is *where* that score is enforced:

- The score and its threshold checks are **not** trusted only at the AI
  service or the backend — `IssuePrescription` itself re-validates
  `appropriatenessScore` and rejects anything below `MIN_APPROPRIATENESS_SCORE`
  (0.4) on-chain. This means the AI service is advisory input, but the
  *policy* ("below 40% cannot be prescribed") is a chaincode invariant that
  holds even if a client bypassed the AI service or the backend entirely and
  submitted a transaction directly to the Fabric Gateway.
- The backend (`POST /api/prescriptions`) additionally pre-checks the same
  threshold before calling the chaincode, purely so a blocked attempt fails
  fast (no wasted endorsement round-trip) and can return the AI's suggested
  alternative drug to the UI — an optimisation, not the actual guarantee.
- Scores between 40-50% are allowed but recorded as "consider alternative";
  the `PRESCRIBER_RX` index (above) lets the regulator console flag a doctor
  who has issued three or more of these, a softer signal than the hard floor.

## Inventory reconciliation as a leakage-detection primitive

Whitepaper §7.5.3 describes regulator aggregation; the prototype extends this
into a specific, testable claim: **a pharmacy cannot silently sell
antibiotics without a prescription without also having to fabricate a
matching physical stock count at every audit.**

The mechanism: `expectedStock` for a (pharmacy, drug) pair only ever moves
through two paths — up via `RecordStockReceipt` (self-reported, but
timestamped and immutable once written), and down via `DispensePrescription`
(automatic, driven by real on-chain prescription fills, not
self-reported at all). A pharmacy's self-reported physical count
(`ReportStockAudit`) is compared against this chain-derived expectation, and
the regulator console's Overview tab ranks every pharmacy by total
discrepancy — turning "check 5,000 pharmacies one at a time" into "the ones
at the top of this list are the ones to investigate first."

## Frontend architecture: four independent applications

Unlike a typical single-page app with role-based routing, Rx-Guard's
front-end is four separate Vite projects (`frontend/doctor`, `frontend/pharmacy`,
`frontend/regulator`, `frontend/verify`), each with its own port, visual
identity, and login flow scoped to one role only:

| App | Port | Auth | Purpose |
|---|---|---|---|
| Doctor | 5173 | JWT (role: doctor) | Issue prescriptions |
| Pharmacy | 5174 | JWT (role: pharmacy) | Verify, dispense, inventory |
| Regulator | 5175 | JWT (role: regulator) | Oversight: overview, prescriber revocation, audit trail, per-pharmacy report |
| Public Verify | 5176 | none | Patient-facing authenticity check |

This mirrors how these would realistically be separate products in
production (a clinic's EHR integration, a pharmacy POS integration, a
government internal tool, and a public page have different security
postures and release cadences) rather than a convenience of the prototype.
They share no code at build time — each has its own small API client and JWT
session helper — communicating only through the shared `backend/` REST API,
which itself talks to Fabric through a single Gateway connection module
(`backend/src/fabric/connect.js`).

## Integration with legacy / non-blockchain systems

The `backend/` Express API is the seam: it's the only component that holds
Fabric Gateway connections, and the only component any front-end (or a
future hospital information system) talks to. A hospital's existing EHR
would integrate by calling `POST /api/prescriptions` the same way the doctor
front-end does, rather than touching the ledger directly — this matches
whitepaper §3.3 ("does not attempt to replace existing hospital information
systems... sits alongside them as a verification layer").

## Privacy & security (rubric: Privacy & Security Risks, 20 pts)

- **Data minimisation**: enforced at the chaincode parameter level (above).
- **Access control, two layers**: see "Two-layer identity" above — MSP
  identity for chain-level authorization, JWT accounts for application-level
  identity and UX. Every state-changing chaincode function calls
  `_requireRole()`.
- **Key management**: in this prototype, the backend holds each org's demo
  user identity/key on disk (`fabric-samples/test-network/organizations/...`),
  appropriate only for a local demo. Whitepaper §6.3 describes the
  production answer (mobile hardware-backed keys per prescriber, HSMs for
  institutional signers) — `RevokePrescriber` is the revocation primitive an
  on-chain registry would call.
- **Transport security**: all Fabric Gateway traffic uses mutual TLS.
- **Self-reported-data honesty**: documented as a known limitation in the
  root README rather than glossed over — `ReportStockAudit` figures are
  pharmacy-reported and could be falsified the same way a paper count could;
  what the chain adds is that the *expected* side of the comparison can't be
  falsified, and every audit submission is itself an immutable, timestamped
  record, unlike a paper ledger a pharmacy could simply not keep.

## Governance hooks present in the code

- `RegisterPrescriber` / `RevokePrescriber` — network membership governance
  (whitepaper §8.1) at the individual-prescriber level, with a live UI
  (regulator console's Prescribers tab) rather than being chaincode-only.
  Revoking writes to the ledger immediately; every pharmacy rejects that
  prescriber's future prescriptions from that point on with no separate
  notification needed — the strongest concrete argument this prototype makes
  for a shared ledger over a per-institution database.
- Role-gated chaincode functions — permission structure (§8.2).
- `GetPrescriptionHistory` — every write to a prescription is retained in
  Fabric's block history and queryable by transaction ID and timestamp,
  surfaced via the regulator console's Audit Trail tab, supporting the audit
  requirement in §8.3 (SLA / incident reporting) without extra tooling.
- `GetPrescriptionsForPrescriber` + the national Overview aggregation —
  proactive pattern detection (repeated low-appropriateness prescribing,
  pharmacy stock discrepancies) rather than purely reactive lookup.
