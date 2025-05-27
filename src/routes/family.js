const express = require('express');
const { body } = require('express-validator');
const {
  getFamily,
  updateFamily,
  inviteMember,
  joinFamily,
  updateMemberRole,
  removeMember,
  leaveFamily,
  getInvitations,
  cancelInvitation
} = require('../controllers/familyController');
const { authenticate, requireFamilyMember, requireFamilyAdmin } = require('../middleware/auth');

const router = express.Router();

// Middleware: tutte le routes richiedono autenticazione
router.use(authenticate);

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

// @route   GET /api/family
// @desc    Ottieni informazioni famiglia corrente
// @access  Private
router.get('/', requireFamilyMember, getFamily);

// @route   PUT /api/family
// @desc    Aggiorna informazioni famiglia
// @access  Private (Admin only)
router.put('/', requireFamilyAdmin, updateFamilyValidation, updateFamily);

// @route   GET /api/family/invitations
// @desc    Ottieni inviti pendenti
// @access  Private (Admin only)
router.get('/invitations', requireFamilyAdmin, getInvitations);

// @route   POST /api/family/invite
// @desc    Invita nuovo membro alla famiglia
// @access  Private (Admin only)
router.post('/invite', requireFamilyAdmin, inviteMemberValidation, inviteMember);

// @route   POST /api/family/join/:token
// @desc    Accetta invito famiglia
// @access  Private
router.post('/join/:token', joinFamily);

// @route   POST /api/family/leave
// @desc    Lascia famiglia
// @access  Private
router.post('/leave', requireFamilyMember, leaveFamily);

// @route   PUT /api/family/members/:userId
// @desc    Aggiorna ruolo membro famiglia
// @access  Private (Admin only)
router.put('/members/:userId', requireFamilyAdmin, updateMemberRoleValidation, updateMemberRole);

// @route   DELETE /api/family/members/:userId
// @desc    Rimuovi membro dalla famiglia
// @access  Private (Admin only)
router.delete('/members/:userId', requireFamilyAdmin, removeMember);

// @route   DELETE /api/family/invitations/:invitationId
// @desc    Cancella invito
// @access  Private (Admin only)
router.delete('/invitations/:invitationId', requireFamilyAdmin, cancelInvitation);

module.exports = router; 