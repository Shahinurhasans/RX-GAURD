'use strict';

const express = require('express');
const cors = require('cors');
const { connectAs } = require('./fabric/connect');
const { slugify, issueToken, requireRole, findByEmail, insert, listByRole, bcrypt } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001';

function decodeResult(bytes) {
    const text = Buffer.from(bytes).toString('utf8');
    return text ? JSON.parse(text) : null;
}

// --- Account registration & login -----------------------------------------
//
// A doctor account is backed by an on-chain prescriber record (so
// IssuePrescription's _requireRole/prescriber-registry checks recognise
// them); a pharmacy account is backed only by this off-chain directory,
// since dispensing authorization is already enforced by Fabric MSP
// membership (PharmacyOrgMSP) rather than a per-pharmacy ledger entry.

app.post('/api/auth/register/doctor', async (req, res) => {
    const { name, email, password, registrationBody } = req.body;
    if (!name || !email || !password || !registrationBody) {
        return res.status(400).json({ error: 'name, email, password, and registrationBody are required' });
    }
    if (findByEmail(email)) {
        return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const prescriberId = slugify('prescriber', name);
    let conn;
    try {
        conn = await connectAs('org1');
        await conn.contract.submitTransaction('RegisterPrescriber', prescriberId, name, registrationBody, '');
    } catch (err) {
        return res.status(400).json({ error: `On-chain registration failed: ${err.message}` });
    } finally {
        conn?.close();
    }

    const user = insert({
        role: 'doctor', email, passwordHash: bcrypt.hashSync(password, 10),
        entityId: prescriberId, name, registrationBody
    });
    res.json({ token: issueToken(user), role: 'doctor', entityId: prescriberId, name });
});

app.post('/api/auth/register/pharmacy', (req, res) => {
    const { name, email, password, licenseNumber } = req.body;
    if (!name || !email || !password || !licenseNumber) {
        return res.status(400).json({ error: 'name, email, password, and licenseNumber are required' });
    }
    if (findByEmail(email)) {
        return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const pharmacyId = slugify('pharmacy', name);
    const user = insert({
        role: 'pharmacy', email, passwordHash: bcrypt.hashSync(password, 10),
        entityId: pharmacyId, pharmacyId, name, licenseNumber
    });
    res.json({ token: issueToken(user), role: 'pharmacy', entityId: pharmacyId, name });
});

app.post('/api/auth/register/regulator', (req, res) => {
    const { name, email, password, agency } = req.body;
    if (!name || !email || !password || !agency) {
        return res.status(400).json({ error: 'name, email, password, and agency are required' });
    }
    if (findByEmail(email)) {
        return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const regulatorId = slugify('regulator', name);
    const user = insert({
        role: 'regulator', email, passwordHash: bcrypt.hashSync(password, 10),
        entityId: regulatorId, name, agency
    });
    res.json({ token: issueToken(user), role: 'regulator', entityId: regulatorId, name });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const user = findByEmail(email || '');
    if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ token: issueToken(user), role: user.role, entityId: user.entityId, name: user.name });
});

// --- Prescription issuance (whitepaper 7.5.1) -----------------------------

app.post('/api/prescriptions', requireRole('doctor'), async (req, res) => {
    const { prescriptionId, patientHash, diagnosis, drugCode, dose, duration, quantity } = req.body;
    const prescriberId = req.user.entityId;

    let conn;
    try {
        // 1. Ask the AI appropriateness service for a score before committing.
        const aiResponse = await fetch(`${AI_SERVICE_URL}/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ diagnosis, drug: drugCode })
        });
        if (!aiResponse.ok) {
            const detail = await aiResponse.text();
            return res.status(400).json({ error: `AI scoring failed: ${detail}` });
        }
        const ai = await aiResponse.json();

        // 2. Commit the signed prescription + score to the Fabric ledger.
        conn = await connectAs('org1');
        const result = await conn.contract.submitTransaction(
            'IssuePrescription',
            prescriptionId,
            patientHash,
            drugCode,
            ai.aware_category,
            dose,
            duration,
            String(quantity),
            String(ai.appropriateness_score),
            ai.model_version_hash,
            prescriberId,
            `sig:${prescriberId}:${prescriptionId}` // placeholder for a real detached signature
        );

        res.json({ prescription: decodeResult(result), ai });
    } catch (err) {
        res.status(400).json({ error: err.message });
    } finally {
        conn?.close();
    }
});

// --- Dispensing verification (whitepaper 7.5.2) ---------------------------

app.get('/api/prescriptions/:id/verify', async (req, res) => {
    let conn;
    try {
        conn = await connectAs('org2');
        const result = await conn.contract.evaluateTransaction('VerifyPrescription', req.params.id);
        res.json(decodeResult(result));
    } catch (err) {
        res.status(404).json({ error: err.message });
    } finally {
        conn?.close();
    }
});

app.post('/api/prescriptions/:id/dispense', requireRole('pharmacy'), async (req, res) => {
    const { dispensedDrugCode } = req.body;
    const pharmacyId = req.user.pharmacyId;
    const pharmacistId = req.user.entityId;
    let conn;
    try {
        conn = await connectAs('org2');
        const result = await conn.contract.submitTransaction(
            'DispensePrescription',
            req.params.id, pharmacyId, pharmacistId, dispensedDrugCode,
            `sig:${pharmacistId}:${req.params.id}`
        );
        res.json(decodeResult(result));
    } catch (err) {
        res.status(400).json({ error: err.message });
    } finally {
        conn?.close();
    }
});

app.get('/api/prescriptions/:id/history', async (req, res) => {
    let conn;
    try {
        conn = await connectAs('org1');
        const result = await conn.contract.evaluateTransaction('GetPrescriptionHistory', req.params.id);
        res.json(decodeResult(result));
    } catch (err) {
        res.status(404).json({ error: err.message });
    } finally {
        conn?.close();
    }
});

// --- Pharmacy inventory (leakage / no-prescription-sale detection) --------
//
// RecordStockReceipt logs what came in; every on-chain dispense auto-decrements
// the expected count (see chaincode DispensePrescription); ReportStockAudit
// logs what a physical count actually found. A positive discrepancy means
// more left the shelf than the chain can account for.

app.post('/api/pharmacy/stock/receipt', requireRole('pharmacy'), async (req, res) => {
    const { drugCode, quantity } = req.body;
    let conn;
    try {
        conn = await connectAs('org2');
        const result = await conn.contract.submitTransaction(
            'RecordStockReceipt', req.user.pharmacyId, drugCode, String(quantity)
        );
        res.json(decodeResult(result));
    } catch (err) {
        res.status(400).json({ error: err.message });
    } finally {
        conn?.close();
    }
});

app.post('/api/pharmacy/stock/audit', requireRole('pharmacy'), async (req, res) => {
    const { drugCode, physicalCount } = req.body;
    let conn;
    try {
        conn = await connectAs('org2');
        const result = await conn.contract.submitTransaction(
            'ReportStockAudit', req.user.pharmacyId, drugCode, String(physicalCount)
        );
        res.json(decodeResult(result));
    } catch (err) {
        res.status(400).json({ error: err.message });
    } finally {
        conn?.close();
    }
});

app.get('/api/pharmacy/stock', requireRole('pharmacy'), async (req, res) => {
    let conn;
    try {
        conn = await connectAs('org2');
        const result = await conn.contract.evaluateTransaction(
            'GetStockStatusForPharmacy', req.user.pharmacyId
        );
        res.json(decodeResult(result));
    } catch (err) {
        res.status(404).json({ error: err.message });
    } finally {
        conn?.close();
    }
});

// --- Regulator aggregation (whitepaper 7.5.3) ------------------------------

app.get('/api/regulator/pharmacies', requireRole('regulator'), (_req, res) => {
    const pharmacies = listByRole('pharmacy').map((p) => ({ pharmacyId: p.pharmacyId, name: p.name }));
    res.json(pharmacies);
});

app.get('/api/regulator/pharmacies/:pharmacyId/dispensing', requireRole('regulator'), async (req, res) => {
    let conn;
    try {
        conn = await connectAs('org1');
        const result = await conn.contract.evaluateTransaction(
            'GetDispensingEventsForPharmacy', req.params.pharmacyId
        );
        res.json(decodeResult(result));
    } catch (err) {
        res.status(404).json({ error: err.message });
    } finally {
        conn?.close();
    }
});

app.get('/api/regulator/pharmacies/:pharmacyId/stock', requireRole('regulator'), async (req, res) => {
    let conn;
    try {
        conn = await connectAs('org1');
        const result = await conn.contract.evaluateTransaction(
            'GetStockStatusForPharmacy', req.params.pharmacyId
        );
        res.json(decodeResult(result));
    } catch (err) {
        res.status(404).json({ error: err.message });
    } finally {
        conn?.close();
    }
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Rx-Guard backend listening on http://localhost:${PORT}`);
});
