const express = require('express');
const multer = require('multer');
const { 
  changePassword, 
  changeEmail, 
  uploadAvatar, 
  setAvatarUrl,
  exportUserData, 
  deleteAccount 
} = require('../controllers/profileController');
const { authenticate } = require('../middleware/auth');
const { body } = require('express-validator');
const { avatarStorage } = require('../config/cloudinary');

const router = express.Router();

// Configurazione multer con Cloudinary storage
const upload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo file non supportato. Sono supportati solo JPEG, PNG e WebP'), false);
    }
  }
});

// Validazioni
const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('La password attuale è obbligatoria'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('La nuova password deve essere di almeno 6 caratteri')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La nuova password deve contenere almeno una lettera minuscola, una maiuscola e un numero')
];

const changeEmailValidation = [
  body('email')
    .isEmail()
    .withMessage('Inserisci un\'email valida')
    .normalizeEmail()
];

const setAvatarUrlValidation = [
  body('avatarUrl')
    .isURL()
    .withMessage('Inserisci un URL valido')
    .isLength({ min: 10, max: 500 })
    .withMessage('L\'URL deve essere tra 10 e 500 caratteri')
];

const deleteAccountValidation = [
  body('password')
    .notEmpty()
    .withMessage('La password è obbligatoria per confermare l\'eliminazione dell\'account')
];

// @route   PUT /api/profile/change-password
// @desc    Cambia password utente
// @access  Private
router.put('/change-password', authenticate, changePasswordValidation, changePassword);

// @route   PUT /api/profile/change-email
// @desc    Cambia email utente
// @access  Private
router.put('/change-email', authenticate, changeEmailValidation, changeEmail);

// @route   POST /api/profile/upload-avatar
// @desc    Upload avatar utente
// @access  Private
router.post('/upload-avatar', authenticate, upload.single('avatar'), uploadAvatar);

// @route   PUT /api/profile/set-avatar-url
// @desc    Imposta avatar tramite URL
// @access  Private
router.put('/set-avatar-url', authenticate, setAvatarUrlValidation, setAvatarUrl);

// @route   GET /api/profile/export-data
// @desc    Esporta dati utente
// @access  Private
router.get('/export-data', authenticate, exportUserData);

// @route   DELETE /api/profile/delete-account
// @desc    Elimina account utente
// @access  Private
router.delete('/delete-account', authenticate, deleteAccountValidation, deleteAccount);

module.exports = router; 