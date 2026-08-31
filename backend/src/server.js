'use strict';

const express = require('express');
const cors = require('cors');
const { connectAs } = require('./fabric/connect');

const app = express();
app.use(cors());
app.use(express.json());

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001';

function decodeResult(bytes) {
    const text = Buffer.from(bytes).toString('utf8');
    return text ? JSON.parse(text) : null;
}

// --- Prescriber onboarding -----------------------------------------------

app.post('/api/prescribers', async (req, res) => {
    const { prescriberId, name, registrationBody, publicKeyPem } = req.body;
    let conn;
    try {
        conn = await connectAs('org1');
        const result = await conn.contract.submitTransaction(
            'RegisterPrescriber', prescriberId, name, registrationBody, publicKeyPem || ''
        );
        res.json(decodeResult(result));
    } catch (err) {
        res.status(400).json({ error: err.message });
    } finally {
        conn?.close();
    }
});

// --- Prescription issuance (whitepaper 7.5.1) -----------------------------

app.post('/api/prescriptions', async (req, res) => {
    const {
        prescriptionId, patientHash, diagnosis, drugCode, dose, duration, prescriberId
    } = req.body;

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

app.post('/api/prescriptions/:id/dispense', async (req, res) => {
    const { pharmacyId, pharmacistId, dispensedDrugCode } = req.body;
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

// --- Regulator aggregation (whitepaper 7.5.3) ------------------------------

app.get('/api/regulator/pharmacies/:pharmacyId/dispensing', async (req, res) => {
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

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Rx-Guard backend listening on http://localhost:${PORT}`);
});
