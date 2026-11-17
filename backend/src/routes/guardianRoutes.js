const express = require('express');
const {
    addGuardian,
    getGuardians,
    removeGuardian,
    updateGuardian,
    verifyGuardian,
    resendVerification
} = require('../controllers/guardianController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

// PUBLIC: guardians are not logged in, so this must come BEFORE verifyToken
router.get('/verify/:token', verifyGuardian);

// Everything below this line requires login
router.use(verifyToken);

router.route('/')
    .post(addGuardian)
    .get(getGuardians);

router.post('/:id/resend', resendVerification);

router.route('/:id')
    .put(updateGuardian)
    .delete(removeGuardian);

module.exports = router;