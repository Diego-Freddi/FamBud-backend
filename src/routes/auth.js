const express = require('express');
const { register, login, getMe, createFamily, forgotPassword, resetPassword } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Registrazione nuovo utente
// @access  Public
router.post('/register', register);

// @route   POST /api/auth/login
// @desc    Login utente
// @access  Public
router.post('/login', login);

// @route   GET /api/auth/me
// @desc    Ottieni profilo utente corrente
// @access  Private
router.get('/me', authenticate, getMe);

// @route   POST /api/auth/create-family
// @desc    Crea nuova famiglia
// @access  Private
router.post('/create-family', authenticate, createFamily);

// @route   POST /api/auth/forgot-password
// @desc    Richiesta reset password
// @access  Public
router.post('/forgot-password', forgotPassword);

// @route   POST /api/auth/reset-password/:token
// @desc    Reset password con token
// @access  Public
router.post('/reset-password/:token', resetPassword);

module.exports = router; 