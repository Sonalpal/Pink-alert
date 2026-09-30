const express = require('express');
const { registerUser, loginUser, logoutUser, getCurrentUser, refreshToken, verifyEmail, resendEmailOtp } = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();
router.post('/verify-email', verifyEmail);
router.post('/resend-otp', resendEmailOtp);

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', verifyToken, logoutUser);
router.get('/me', verifyToken, getCurrentUser);
router.get('/refresh', verifyToken, refreshToken);

module.exports = router;
