'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { findByEmail, insert } = require('./store');

// Prototype-scope secret: a real deployment must supply JWT_SECRET via env.
const JWT_SECRET = process.env.JWT_SECRET || 'rxguard-dev-secret-change-in-production';

function slugify(prefix, name) {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const suffix = Date.now().toString(36).slice(-4);
    return `${prefix}-${base}-${suffix}`;
}

function issueToken(user) {
    return jwt.sign(
        { role: user.role, entityId: user.entityId, pharmacyId: user.pharmacyId, name: user.name },
        JWT_SECRET,
        { expiresIn: '12h' }
    );
}

function requireRole(role) {
    return (req, res, next) => {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) return res.status(401).json({ error: 'Not authenticated' });
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            if (payload.role !== role) {
                return res.status(403).json({ error: `This action requires a ${role} account` });
            }
            req.user = payload;
            next();
        } catch {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }
    };
}

module.exports = { slugify, issueToken, requireRole, findByEmail, insert, bcrypt };
