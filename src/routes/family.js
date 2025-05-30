const express = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const {
  getFamily,
  updateFamily,
  inviteMember,
  joinFamily,
  updateMemberRole,
  removeMember,
  leaveFamily,
  getInvitations,
  cancelInvitation,
  uploadFamilyBanner,
  setFamilyBannerUrl,
  removeFamilyBanner
} = require('../controllers/familyController');
const { authenticate, requireFamilyMember, requireFamilyAdmin } = require('../middleware/auth');

const router = express.Router();

// Configurazione multer per upload banner
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo file immagine sono permessi'), false);
    }
  }
});

// Validazioni per aggiornamento famiglia
const updateFamilyValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Il nome famiglia deve essere tra 1 e 100 caratteri'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La descrizione non può superare i 500 caratteri'),
  body('settings.currency')
    .optional()
    .isIn(['EUR', 'USD', 'GBP'])
    .withMessage('Valuta non supportata'),
  body('settings.notifications.email')
    .optional()
    .isBoolean()
    .withMessage('Notifiche email deve essere un booleano'),
  body('settings.notifications.budgetAlerts')
    .optional()
    .isBoolean()
    .withMessage('Avvisi budget deve essere un booleano')
];

// Validazioni per invito membro
const inviteMemberValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email non valida'),
  body('role')
    .optional()
    .isIn(['admin', 'member'])
    .withMessage('Ruolo non valido')
];

// Validazioni per aggiornamento ruolo
const updateMemberRoleValidation = [
  body('role')
    .isIn(['admin', 'member'])
    .withMessage('Ruolo non valido')
];

// Validazioni per banner URL
const bannerUrlValidation = [
  body('bannerUrl')
    .isURL()
    .withMessage('URL banner non valido')
];

// @route   GET /api/family
// @desc    Ottieni informazioni famiglia corrente
// @access  Private
router.get('/', authenticate, requireFamilyMember, getFamily);

// @route   PUT /api/family
// @desc    Aggiorna famiglia
// @access  Private (Admin only)
router.put('/', authenticate, requireFamilyAdmin, updateFamilyValidation, updateFamily);

// @route   GET /api/family/invitations
// @desc    Ottieni inviti pendenti
// @access  Private (Admin only)
router.get('/invitations', authenticate, requireFamilyAdmin, getInvitations);

// @route   POST /api/family/invite
// @desc    Invita nuovo membro alla famiglia
// @access  Private (Admin only)
router.post('/invite', authenticate, requireFamilyAdmin, inviteMemberValidation, inviteMember);

// @route   POST /api/family/join/:token
// @desc    Accetta invito famiglia
// @access  Private
router.post('/join/:token', authenticate, joinFamily);

// @route   POST /api/family/leave
// @desc    Lascia famiglia
// @access  Private
router.post('/leave', authenticate, requireFamilyMember, leaveFamily);

// @route   PUT /api/family/members/:userId
// @desc    Aggiorna ruolo membro
// @access  Private (Admin only)
router.put('/members/:userId', authenticate, requireFamilyAdmin, updateMemberRoleValidation, updateMemberRole);

// @route   DELETE /api/family/members/:userId
// @desc    Rimuovi membro dalla famiglia
// @access  Private (Admin only)
router.delete('/members/:userId', authenticate, requireFamilyAdmin, removeMember);

// @route   DELETE /api/family/invitations/:invitationId
// @desc    Cancella invito
// @access  Private (Admin only)
router.delete('/invitations/:invitationId', authenticate, requireFamilyAdmin, cancelInvitation);

// @route   POST /api/family/upload-banner
// @desc    Upload banner famiglia
// @access  Private (Admin only)
router.post('/upload-banner', authenticate, requireFamilyAdmin, upload.single('banner'), uploadFamilyBanner);

// @route   PUT /api/family/set-banner-url
// @desc    Imposta banner famiglia tramite URL
// @access  Private (Admin only)
router.put('/set-banner-url', authenticate, requireFamilyAdmin, bannerUrlValidation, setFamilyBannerUrl);

// @route   DELETE /api/family/banner
// @desc    Rimuovi banner famiglia
// @access  Private (Admin only)
router.delete('/banner', authenticate, requireFamilyAdmin, removeFamilyBanner);

module.exports = router; 