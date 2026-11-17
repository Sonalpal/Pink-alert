const SOS = require('../models/SOS');
const Guardian = require('../models/Guardian');
const User = require('../models/User');
const { logActivity } = require('./activityController');
const sendSOSEmail = require('../services/sendSOSEmail');

// Turns "", null and undefined into NaN (Number(null) would wrongly give 0)
const toNum = (v) => (v === undefined || v === null || v === '' ? NaN : Number(v));

const triggerSOS = async (req, res, next) => {
    try {
        const latitude = toNum(req.body.latitude);
        const longitude = toNum(req.body.longitude);
        const accuracy = toNum(req.body.accuracy);
        const notes = typeof req.body.notes === 'string' ? req.body.notes.trim().slice(0, 500) : undefined;

        if (
            !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
            latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
        ) {
            res.status(400);
            throw new Error('A valid latitude and longitude are required to trigger SOS');
        }

        // Only verified, active guardians can receive the alert
        const guardians = await Guardian.find({
            userId: req.user.userId,
            status: 'active',
            isVerified: true
        });

        if (guardians.length === 0) {
            res.status(400);
            throw new Error(
                'No verified guardians yet. Ask your guardians to verify their email. If you need help now, call 112.'
            );
        }

        // Save the SOS first so a record exists even if the email step fails
        const sos = await SOS.create({
            userId: req.user.userId,
            latitude,
            longitude,
            guardiansNotified: [],
            notes,
            status: 'triggered'
        });

        const user = await User.findById(req.user.userId).select('name');

        let emailResult = { sent: 0, failed: guardians.length, sentTo: [] };
        try {
            emailResult = await sendSOSEmail({
                guardians,
                userName: user?.name || 'Someone',
                lat: latitude,
                lon: longitude,
                accuracy
            });
        } catch (mailErr) {
            console.error('SOS email error:', mailErr);
        }

        // Record only the guardians who were actually emailed
        sos.guardiansNotified = emailResult.sentTo;
        await sos.save();

        // A logging problem must never turn a sent SOS into an error
        try {
            await logActivity(req.user.userId, 'sos_triggered', {
                sosId: sos._id,
                latitude,
                longitude,
                emailsSent: emailResult.sent
            });
        } catch (logErr) {
            console.error('Activity log failed:', logErr);
        }

        // SOS saved, but nobody could be emailed: tell the user clearly
        if (emailResult.sent === 0) {
            return res.status(502).json({
                success: false,
                message: 'SOS was recorded, but the alert email could not be sent. Please call your guardians or 112 directly.',
                data: sos
            });
        }

        const allSent = emailResult.sent === guardians.length;
        res.status(201).json({
            success: true,
            message: allSent
                ? `SOS sent. ${emailResult.sent} guardian(s) notified by email.`
                : `SOS sent to ${emailResult.sent} of ${guardians.length} guardians. Please call the others directly.`,
            data: sos
        });
    } catch (err) {
        next(err);
    }
};

const getSOSHistory = async (req, res, next) => {
    try {
        const history = await SOS.find({ userId: req.user.userId }).sort({ triggeredAt: -1 }).populate('guardiansNotified');
        res.status(200).json({ success: true, message: 'SOS history fetched', data: history });
    } catch (err) {
        next(err);
    }
};

const resolveSOS = async (req, res, next) => {
    try {
        const { id } = req.params;
        const sos = await SOS.findOne({ _id: id, userId: req.user.userId });

        if (!sos) {
            res.status(404);
            throw new Error('SOS record not found');
        }

        if (sos.status === 'resolved') {
            res.status(400);
            throw new Error('SOS already resolved');
        }

        sos.status = 'resolved';
        sos.resolvedAt = Date.now();
        await sos.save();

        res.status(200).json({ success: true, message: 'SOS resolved', data: sos });
    } catch (err) {
        next(err);
    }
};

const getSOS = async (req, res, next) => {
    try {
        const { id } = req.params;
        const sos = await SOS.findOne({ _id: id, userId: req.user.userId }).populate('guardiansNotified');

        if (!sos) {
            res.status(404);
            throw new Error('SOS record not found');
        }

        res.status(200).json({ success: true, message: 'SOS record fetched', data: sos });
    } catch (err) {
        next(err);
    }
};

module.exports = { triggerSOS, getSOSHistory, resolveSOS, getSOS };