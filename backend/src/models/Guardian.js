const mongoose = require('mongoose');

const guardianSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    guardianName: {
        type: String,
        required: [true, 'Guardian name is required'],
        trim: true,
        minlength: [2, 'Guardian name must be at least 2 characters'],
        maxlength: [50, 'Guardian name cannot exceed 50 characters']
    },
    guardianEmail: {
        type: String,
        required: [true, 'Guardian email is required'],
        trim: true,
        lowercase: true,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address']
    },
    guardianPhone: {
        type: String,
        trim: true,
        match: [/^\d{10}$/, 'Phone number must be exactly 10 digits']
        // now optional: email is the verified channel
    },
    relationship: {
        type: String,
        enum: ['Mom', 'Dad', 'Sister', 'Brother', 'Friend', 'Partner', 'Spouse', 'Guardian', 'Other'],
        default: 'Other'
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    addedAt: {
        type: Date,
        default: Date.now
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verifiedAt: {
        type: Date
    },
    verificationSentAt: {
        type: Date
    },
    // Only the hash is stored, never the raw token
    verifyTokenHash: {
        type: String,
        select: false
    },
    verifyTokenExpires: {
        type: Date,
        select: false
    }
});

guardianSchema.index({ userId: 1 });
guardianSchema.index({ status: 1 });
// One guardian email per user (blocks duplicates)
guardianSchema.index({ userId: 1, guardianEmail: 1 }, { unique: true });
// Fast lookup when the guardian clicks the link
guardianSchema.index({ verifyTokenHash: 1 });

const Guardian = mongoose.model('Guardian', guardianSchema);
module.exports = Guardian;