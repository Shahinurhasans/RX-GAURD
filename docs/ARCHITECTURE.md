# Rx-Guard prototype — architecture notes

Companion to the whitepaper's §7 (System Architecture). This document answers
the specific questions the BCOLBD prototype rubric asks for (consensus setup,
on/off-chain data, legacy-system integration, data model, digital identity).

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
  CA — this is the "digital identity system" the rubric asks about.

## On-chain vs off-chain data

See the table in the root `README.md` and whitepaper Table 7.4. Enforced in
code: `chaincode/rxguard/lib/rxGuardContract.js`'s `IssuePrescription` takes a
`patientHash` parameter, never a name or NID — there is no code path in this
repository that can write patient-identifying data to the ledger.

## Data model

Two asset types, both plain JSON documents in the Fabric world state:

- **`prescriber`** (key: `PRESCRIBER\x00<prescriberId>\x00`, composite key) —
  registration status, issuing professional body, active/revoked flag.
- **`prescription`** (key: `<prescriptionId>`, plain key) — full lifecycle
  record (`ISSUED -> FILLED | EXPIRED`), see the contract for the exact
  field list.
- **`DISPENSE` composite-key index** (`DISPENSE\x00<pharmacyId>\x00<weekBucket>\x00<prescriptionId>\x00`) —
  lets the regulator range-query dispensing volume per pharmacy per week
  without a second database (whitepaper §7.5.3's aggregation flow), using
  Fabric's native `getStateByPartialCompositeKey`.

## Integration with legacy / non-blockchain systems

The `backend/` Express API is the seam: it's the only component that holds
Fabric Gateway connections, and the only component the front-end or a future
hospital information system talks to. A hospital's existing EHR would
integrate by calling `POST /api/prescriptions` the same way the prescriber
front-end does, rather than touching the ledger directly — this matches
whitepaper §3.3 ("does not attempt to replace existing hospital information
systems... sits alongside them as a verification layer").

## Privacy & security (rubric: Privacy & Security Risks, 20 pts)

- **Data minimisation**: enforced at the chaincode parameter level (above).
- **Access control**: `_requireRole()` in the chaincode checks the caller's
  MSP identity (from `ctx.clientIdentity.getMSPID()`) before every state
  change — a pharmacist identity cannot call `IssuePrescription`, a
  prescriber identity cannot call `DispensePrescription`.
- **Key management**: in this prototype, the backend holds each org's demo
  user identity/key on disk (`fabric-samples/test-network/organizations/...`),
  which is appropriate only for a local demo. Whitepaper §6.3 describes the
  production answer (mobile hardware-backed keys per prescriber, HSMs for
  institutional signers, an on-chain revocation registry) — `RevokePrescriber`
  in the chaincode is the revocation primitive that registry would call.
- **Transport security**: all Fabric Gateway traffic uses mutual TLS (the
  `.crt`/keystore material under `organizations/peerOrganizations/`).

## Governance hooks present in the code

- `RegisterPrescriber` / `RevokePrescriber` — network membership governance
  (whitepaper §8.1) at the individual-prescriber level.
- Role-gated chaincode functions — permission structure (§8.2).
- `GetPrescriptionHistory` — every write to a prescription is retained in
  Fabric's block history and queryable, supporting the audit requirement in
  §8.3 (SLA / incident reporting) without extra tooling.
