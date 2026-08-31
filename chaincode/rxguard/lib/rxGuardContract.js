'use strict';

const { Contract } = require('fabric-contract-api');
const crypto = require('crypto');

const STATUS_ISSUED = 'ISSUED';
const STATUS_FILLED = 'FILLED';
const STATUS_EXPIRED = 'EXPIRED';
const STATUS_REVOKED = 'REVOKED';

const AWARE_ACCESS = 'ACCESS';
const AWARE_WATCH = 'WATCH';
const AWARE_RESERVE = 'RESERVE';

class RxGuardContract extends Contract {

    async InitLedger(ctx) {
        return JSON.stringify({ initialized: true, ts: new Date().toISOString() });
    }

    // --- Prescriber identity -------------------------------------------------

    async RegisterPrescriber(ctx, prescriberId, name, registrationBody, publicKeyPem) {
        this._requireRole(ctx, ['regulator', 'professionalBody']);

        const key = ctx.stub.createCompositeKey('PRESCRIBER', [prescriberId]);
        const exists = await this._assetExists(ctx, key);
        if (exists) {
            throw new Error(`Prescriber ${prescriberId} already registered`);
        }

        const prescriber = {
            docType: 'prescriber',
            prescriberId,
            name,
            registrationBody,
            publicKeyPem,
            active: true,
            registeredAt: ctx.stub.getTxTimestamp().seconds.low
        };

        await ctx.stub.putState(key, Buffer.from(JSON.stringify(prescriber)));
        return JSON.stringify(prescriber);
    }

    async RevokePrescriber(ctx, prescriberId, reason) {
        this._requireRole(ctx, ['regulator', 'professionalBody']);

        const key = ctx.stub.createCompositeKey('PRESCRIBER', [prescriberId]);
        const raw = await ctx.stub.getState(key);
        if (!raw || raw.length === 0) {
            throw new Error(`Prescriber ${prescriberId} not found`);
        }
        const prescriber = JSON.parse(raw.toString());
        prescriber.active = false;
        prescriber.revokedReason = reason;
        prescriber.revokedAt = ctx.stub.getTxTimestamp().seconds.low;

        await ctx.stub.putState(key, Buffer.from(JSON.stringify(prescriber)));
        return JSON.stringify(prescriber);
    }

    // --- Prescription issuance (whitepaper 7.5.1) -----------------------------

    async IssuePrescription(ctx, prescriptionId, patientHash, drugCode, awareCategory,
        dose, duration, appropriatenessScore, modelVersionHash, prescriberId, prescriberSignature) {

        this._requireRole(ctx, ['prescriber']);

        if (![AWARE_ACCESS, AWARE_WATCH, AWARE_RESERVE].includes(awareCategory)) {
            throw new Error(`Invalid AWaRe category: ${awareCategory}`);
        }

        const prescriberKey = ctx.stub.createCompositeKey('PRESCRIBER', [prescriberId]);
        const prescriberRaw = await ctx.stub.getState(prescriberKey);
        if (!prescriberRaw || prescriberRaw.length === 0) {
            throw new Error(`Unknown prescriber ${prescriberId}`);
        }
        const prescriber = JSON.parse(prescriberRaw.toString());
        if (!prescriber.active) {
            throw new Error(`Prescriber ${prescriberId} is revoked and may not issue prescriptions`);
        }

        const existing = await ctx.stub.getState(prescriptionId);
        if (existing && existing.length > 0) {
            throw new Error(`Prescription ${prescriptionId} already exists`);
        }

        const txTimestamp = ctx.stub.getTxTimestamp().seconds.low;

        // No patient PII is stored on chain, only a hash supplied by the issuing facility.
        const recordForHash = `${prescriptionId}|${patientHash}|${drugCode}|${dose}|${duration}|${prescriberId}|${txTimestamp}`;
        const prescriptionHash = crypto.createHash('sha256').update(recordForHash).digest('hex');

        const prescription = {
            docType: 'prescription',
            prescriptionId,
            patientHash,
            drugCode,
            awareCategory,
            dose,
            duration,
            appropriatenessScore: Number(appropriatenessScore),
            modelVersionHash,
            prescriberId,
            prescriberSignature,
            prescriptionHash,
            status: STATUS_ISSUED,
            issuedAt: txTimestamp,
            validUntil: txTimestamp + (30 * 24 * 60 * 60), // 30 day validity window
            filledAt: null,
            pharmacyId: null,
            pharmacistId: null
        };

        await ctx.stub.putState(prescriptionId, Buffer.from(JSON.stringify(prescription)));

        ctx.stub.setEvent('PrescriptionIssued', Buffer.from(JSON.stringify({
            prescriptionId, drugCode, awareCategory, appropriatenessScore, prescriberId
        })));

        return JSON.stringify(prescription);
    }

    // --- Dispensing verification (whitepaper 7.5.2) ---------------------------

    async VerifyPrescription(ctx, prescriptionId) {
        const prescription = await this._getPrescription(ctx, prescriptionId);
        const nowSeconds = ctx.stub.getTxTimestamp().seconds.low;

        const valid = prescription.status === STATUS_ISSUED && nowSeconds <= prescription.validUntil;

        return JSON.stringify({
            prescriptionId,
            drugCode: prescription.drugCode,
            awareCategory: prescription.awareCategory,
            dose: prescription.dose,
            duration: prescription.duration,
            appropriatenessScore: prescription.appropriatenessScore,
            status: prescription.status,
            valid
        });
    }

    async DispensePrescription(ctx, prescriptionId, pharmacyId, pharmacistId, dispensedDrugCode, pharmacistSignature) {
        this._requireRole(ctx, ['pharmacist']);

        const prescription = await this._getPrescription(ctx, prescriptionId);
        const nowSeconds = ctx.stub.getTxTimestamp().seconds.low;

        if (prescription.status !== STATUS_ISSUED) {
            throw new Error(`Prescription ${prescriptionId} is not available for dispensing (status: ${prescription.status})`);
        }
        if (nowSeconds > prescription.validUntil) {
            prescription.status = STATUS_EXPIRED;
            await ctx.stub.putState(prescriptionId, Buffer.from(JSON.stringify(prescription)));
            throw new Error(`Prescription ${prescriptionId} has expired`);
        }
        if (dispensedDrugCode !== prescription.drugCode) {
            throw new Error(`Dispensed drug code does not match prescribed drug code`);
        }

        prescription.status = STATUS_FILLED;
        prescription.filledAt = nowSeconds;
        prescription.pharmacyId = pharmacyId;
        prescription.pharmacistId = pharmacistId;
        prescription.pharmacistSignature = pharmacistSignature;

        await ctx.stub.putState(prescriptionId, Buffer.from(JSON.stringify(prescription)));

        // Composite key so the regulator can range-query dispensing events per pharmacy/week
        const weekBucket = Math.floor(nowSeconds / (7 * 24 * 60 * 60));
        const dispenseKey = ctx.stub.createCompositeKey('DISPENSE', [pharmacyId, String(weekBucket), prescriptionId]);
        await ctx.stub.putState(dispenseKey, Buffer.from(JSON.stringify({
            prescriptionId, pharmacyId, pharmacistId, drugCode: dispensedDrugCode,
            awareCategory: prescription.awareCategory, filledAt: nowSeconds
        })));

        ctx.stub.setEvent('PrescriptionDispensed', Buffer.from(JSON.stringify({
            prescriptionId, pharmacyId, drugCode: dispensedDrugCode
        })));

        return JSON.stringify(prescription);
    }

    // --- Regulator aggregation / anomaly support (whitepaper 7.5.3) -----------

    async GetDispensingEventsForPharmacy(ctx, pharmacyId) {
        const iterator = await ctx.stub.getStateByPartialCompositeKey('DISPENSE', [pharmacyId]);
        const results = [];
        let res = await iterator.next();
        while (!res.done) {
            if (res.value && res.value.value.length > 0) {
                results.push(JSON.parse(res.value.value.toString('utf8')));
            }
            res = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(results);
    }

    async GetPrescriptionHistory(ctx, prescriptionId) {
        const iterator = await ctx.stub.getHistoryForKey(prescriptionId);
        const history = [];
        let res = await iterator.next();
        while (!res.done) {
            if (res.value) {
                history.push({
                    txId: res.value.txId,
                    timestamp: res.value.timestamp,
                    isDelete: res.value.isDelete,
                    value: res.value.value.length > 0 ? JSON.parse(res.value.value.toString('utf8')) : null
                });
            }
            res = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(history);
    }

    // --- Helpers ---------------------------------------------------------------

    async _getPrescription(ctx, prescriptionId) {
        const raw = await ctx.stub.getState(prescriptionId);
        if (!raw || raw.length === 0) {
            throw new Error(`Prescription ${prescriptionId} does not exist`);
        }
        return JSON.parse(raw.toString());
    }

    async _assetExists(ctx, key) {
        const raw = await ctx.stub.getState(key);
        return raw && raw.length > 0;
    }

    // Role check based on client MSP identity. The two-org Fabric test-network
    // (Org1MSP, Org2MSP) stands in for the seven-category anchor node set described
    // in whitepaper section 7.3; each org is granted every role it needs to play
    // during the pilot so the demo is runnable on the default test-network, while
    // a production deployment maps roles 1:1 to BMDC/Pharmacy Council/DGDA issued
    // attributes on the client's X.509 certificate instead of org membership.
    _requireRole(ctx, allowedRoles) {
        const mspId = ctx.clientIdentity.getMSPID();
        const rolesForMsp = {
            PrescriberOrgMSP: ['prescriber', 'professionalBody', 'regulator'],
            PharmacyOrgMSP: ['pharmacist'],
            RegulatorOrgMSP: ['regulator', 'professionalBody'],
            Org1MSP: ['prescriber', 'professionalBody', 'regulator'],
            Org2MSP: ['pharmacist']
        };
        const roles = rolesForMsp[mspId] || [];
        const authorized = allowedRoles.some(r => roles.includes(r));
        if (!authorized) {
            throw new Error(`Identity with MSP ${mspId} is not authorized for this action`);
        }
    }
}

module.exports = RxGuardContract;
