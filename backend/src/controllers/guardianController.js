const crypto = require('crypto');
const validator = require('validator');
const Guardian = require('../models/Guardian');
const User = require('../models/User');
const sendGuardianVerification = require('../services/sendGuardianVerification');

const DAY = 24 * 60 * 60 * 1000;
const VALID_RELATIONSHIPS = ['Mom', 'Dad', 'Sister', 'Brother', 'Friend', 'Partner', 'Spouse', 'Guardian', 'Other'];

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

const escapeHtml = (s = '') =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Never send token fields back to the frontend
const toSafe = (guardian) => {
    const obj = guardian.toObject();
    delete obj.verifyTokenHash;
    delete obj.verifyTokenExpires;
    return obj;
};

// Creates a fresh token, saves it (hashed) and emails the guardian the link
const issueVerification = async (guardian, userName) => {
    const token = crypto.randomBytes(32).toString('hex');

    guardian.isVerified = false;
    guardian.verifiedAt = undefined;
    guardian.verifyTokenHash = hashToken(token);
    guardian.verifyTokenExpires = Date.now() + DAY;
    guardian.verificationSentAt = Date.now();
    await guardian.save();

    await sendGuardianVerification({
        to: guardian.guardianEmail,
        guardianName: guardian.guardianName,
        userName,
        token
    });
};

// POST /api/guardians
const addGuardian = async (req, res, next) => {
    try {
        const { guardianName, guardianPhone, relationship } = req.body;
        const guardianEmail = (req.body.guardianEmail || '').trim().toLowerCase();

        // Input validation
        if (!guardianName || !guardianEmail || !relationship) {
            return res.status(400).json({
                success: false,
                message: 'Guardian name, email, and relationship are required'
            });
        }

        // Name validation
        if (guardianName.length < 2 || guardianName.length > 50) {
            return res.status(400).json({
                success: false,
                message: 'Guardian name must be between 2 and 50 characters'
            });
        }

        // Email validation
        if (!validator.isEmail(guardianEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        // Phone validation (optional now, but must be valid if given)
        if (guardianPhone && !/^\d{10}$/.test(guardianPhone)) {
            return res.status(400).json({
                success: false,
                message: 'Phone number must be exactly 10 digits'
            });
        }

        // Relationship validation
        if (!VALID_RELATIONSHIPS.includes(relationship)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid relationship type'
            });
        }

        const user = await User.findById(req.user.userId).select('name email');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.email && user.email.toLowerCase() === guardianEmail) {
            return res.status(400).json({
                success: false,
                message: 'You cannot add yourself as a guardian'
            });
        }

        // Check if this guardian already exists for this user
        const existingGuardian = await Guardian.findOne({
            userId: req.user.userId,
            guardianEmail
        });

        if (existingGuardian && existingGuardian.status === 'active') {
            return res.status(400).json({
                success: false,
                message: 'Guardian already added'
            });
        }

        // Previously removed (soft deleted) guardian: bring back and re-verify
        if (existingGuardian && existingGuardian.status === 'inactive') {
            existingGuardian.guardianName = guardianName;
            existingGuardian.guardianPhone = guardianPhone || undefined;
            existingGuardian.relationship = relationship;
            existingGuardian.status = 'active';
            existingGuardian.addedAt = Date.now();

            try {
                await issueVerification(existingGuardian, user.name);
            } catch (mailErr) {
                console.error('Verification email failed:', mailErr);
                existingGuardian.status = 'inactive';
                await existingGuardian.save();
                return res.status(502).json({
                    success: false,
                    message: 'Could not send the verification email. Check the address and try again.'
                });
            }

            return res.status(201).json({
                success: true,
                message: 'Guardian added. A verification email has been sent.',
                data: toSafe(existingGuardian)
            });
        }

        // Create Guardian (unverified until they click the email link)
        const guardian = await Guardian.create({
            userId: req.user.userId,
            guardianName,
            guardianEmail,
            guardianPhone: guardianPhone || undefined,
            relationship,
            status: 'active',
            addedAt: Date.now(),
            isVerified: false
        });

        try {
            await issueVerification(guardian, user.name);
        } catch (mailErr) {
            // Email failed: don't keep a guardian who can never verify
            console.error('Verification email failed:', mailErr);
            await Guardian.findByIdAndDelete(guardian._id);
            return res.status(502).json({
                success: false,
                message: 'Could not send the verification email. Check the address and try again.'
            });
        }

        res.status(201).json({
            success: true,
            message: 'Guardian added. A verification email has been sent.',
            data: toSafe(guardian)
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Guardian already added' });
        }
        next(err);
    }
};

// GET /api/guardians/verify/:token   (PUBLIC: guardian clicks this from their email)
const verifyGuardian = async (req, res) => {
    try {
        const hash = hashToken(req.params.token);

        const guardian = await Guardian.findOne({
            verifyTokenHash: hash,
            verifyTokenExpires: { $gt: Date.now() },
            status: 'active'
        })
            .select('+verifyTokenHash +verifyTokenExpires')
            .populate('userId', 'name');

        if (!guardian) {
            return res.status(400).send(
                '<div style="font-family:Arial;text-align:center;margin-top:80px"><h2>This link is invalid or has expired.</h2><p>Ask the person to resend the verification email.</p></div>'
            );
        }

        guardian.isVerified = true;
        guardian.verifiedAt = Date.now();
        guardian.verifyTokenHash = undefined;
        guardian.verifyTokenExpires = undefined;
        await guardian.save();

        res.send(`
            <div style="font-family:Arial;text-align:center;margin-top:80px">
                <h2 style="color:#8B4A6A">You're verified ✅</h2>
                <p>You will now receive SOS alerts from ${escapeHtml(guardian.userId.name)}.</p>
            </div>`);
    } catch (err) {
        console.error(err);
        res.status(500).send('<h2>Something went wrong.</h2>');
    }
};

// POST /api/guardians/:id/resend
const resendVerification = async (req, res, next) => {
    try {
        const guardian = await Guardian.findOne({
            _id: req.params.id,
            userId: req.user.userId,
            status: 'active'
        });

        if (!guardian) {
            return res.status(404).json({ success: false, message: 'Guardian not found' });
        }
        if (guardian.isVerified) {
            return res.status(400).json({ success: false, message: 'Guardian is already verified' });
        }

        const user = await User.findById(req.user.userId).select('name');

        try {
            await issueVerification(guardian, user.name);
        } catch (mailErr) {
            console.error('Verification email failed:', mailErr);
            return res.status(502).json({
                success: false,
                message: 'Could not send the verification email. Try again later.'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Verification email sent again',
            data: {}
        });
    } catch (err) {
        next(err);
    }
};

const getGuardians = async (req, res, next) => {
    try {
        // Token fields are select:false in the model, so they are not returned here
        const guardians = await Guardian.find({ userId: req.user.userId, status: 'active' });
        res.status(200).json({
            success: true,
            message: 'Guardians retrieved successfully',
            data: guardians
        });
    } catch (err) {
        next(err);
    }
};

const removeGuardian = async (req, res, next) => {
    try {
        const { id } = req.params;
        const guardian = await Guardian.findOne({ _id: id, userId: req.user.userId });

        if (!guardian) {
            return res.status(404).json({
                success: false,
                message: 'Guardian not found'
            });
        }

        // Soft delete: update status to inactive
        guardian.status = 'inactive';
        guardian.verifyTokenHash = undefined;
        guardian.verifyTokenExpires = undefined;
        await guardian.save();

        res.status(200).json({
            success: true,
            message: 'Guardian removed successfully',
            data: {}
        });
    } catch (err) {
        next(err);
    }
};

const updateGuardian = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { guardianName, guardianPhone, relationship } = req.body;
        const newEmail = req.body.guardianEmail
            ? req.body.guardianEmail.trim().toLowerCase()
            : null;

        const guardian = await Guardian.findOne({ _id: id, userId: req.user.userId });
        if (!guardian) {
            return res.status(404).json({
                success: false,
                message: 'Guardian not found'
            });
        }

        // Validate and update fields if provided
        if (guardianName) {
            if (guardianName.length < 2 || guardianName.length > 50) {
                return res.status(400).json({
                    success: false,
                    message: 'Guardian name must be between 2 and 50 characters'
                });
            }
            guardian.guardianName = guardianName;
        }

        if (guardianPhone) {
            if (!/^\d{10}$/.test(guardianPhone)) {
                return res.status(400).json({
                    success: false,
                    message: 'Phone number must be exactly 10 digits'
                });
            }
            guardian.guardianPhone = guardianPhone;
        }

        if (relationship) {
            if (!VALID_RELATIONSHIPS.includes(relationship)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid relationship type'
                });
            }
            guardian.relationship = relationship;
        }

        // Email changed: must be valid, not a duplicate, and must be verified again
        let emailChanged = false;
        if (newEmail && newEmail !== guardian.guardianEmail) {
            if (!validator.isEmail(newEmail)) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter a valid email address'
                });
            }

            const duplicate = await Guardian.findOne({
                userId: req.user.userId,
                guardianEmail: newEmail,
                _id: { $ne: guardian._id }
            });
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    message: 'Another guardian already uses this email'
                });
            }

            guardian.guardianEmail = newEmail;
            emailChanged = true;
        }

        if (emailChanged) {
            const user = await User.findById(req.user.userId).select('name');
            try {
                await issueVerification(guardian, user.name); // also saves the guardian
            } catch (mailErr) {
                console.error('Verification email failed:', mailErr);
                return res.status(502).json({
                    success: false,
                    message: 'Details saved, but the verification email could not be sent. Use "Resend email".'
                });
            }
        } else {
            await guardian.save();
        }

        res.status(200).json({
            success: true,
            message: emailChanged
                ? 'Guardian updated. A verification email has been sent to the new address.'
                : 'Guardian updated successfully',
            data: toSafe(guardian)
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Another guardian already uses this email' });
        }
        next(err);
    }
};

module.exports = {
    addGuardian,
    getGuardians,
    removeGuardian,
    updateGuardian,
    verifyGuardian,
    resendVerification
};