const express = require('express');
const { body } = require('express-validator');
const {
  getExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats
} = require('../controllers/expenseController');
const { authenticate, requireFamilyMember } = require('../middleware/auth');

const router = express.Router();

// Middleware: tutte le routes richiedono autenticazione e appartenenza famiglia
router.use(authenticate);
router.use(requireFamilyMember);

// Validazioni per creazione spesa
const createExpenseValidation = [
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('L\'importo deve essere un numero positivo'),
  body('description')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('La descrizione è obbligatoria e non può superare i 200 caratteri'),
  body('category')
    .isMongoId()
    .withMessage('ID categoria non valido'),
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Formato data non valido'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('I tag devono essere un array'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Le note non possono superare i 500 caratteri'),
  body('location.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitudine non valida'),
  body('location.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitudine non valida'),
  body('receipt.imageUrl')
    .optional()
    .isURL()
    .withMessage('URL immagine scontrino non valido')
];

// Validazioni per aggiornamento spesa
const updateExpenseValidation = [
  body('amount')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('L\'importo deve essere un numero positivo'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('La descrizione non può essere vuota o superare i 200 caratteri'),
  body('category')
    .optional()
    .isMongoId()
    .withMessage('ID categoria non valido'),
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Formato data non valido'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('I tag devono essere un array'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Le note non possono superare i 500 caratteri')
];

// @route   GET /api/expenses/stats
// @desc    Ottieni statistiche spese
// @access  Private
router.get('/stats', getExpenseStats);

// @route   GET /api/expenses
// @desc    Ottieni tutte le spese della famiglia
// @access  Private
router.get('/', getExpenses);

// @route   GET /api/expenses/:id
// @desc    Ottieni singola spesa
// @access  Private
router.get('/:id', getExpense);

// @route   POST /api/expenses
// @desc    Crea nuova spesa
// @access  Private
router.post('/', createExpenseValidation, createExpense);

// @route   PUT /api/expenses/:id
// @desc    Aggiorna spesa
// @access  Private
router.put('/:id', updateExpenseValidation, updateExpense);

// @route   DELETE /api/expenses/:id
// @desc    Elimina spesa
// @access  Private
router.delete('/:id', deleteExpense);

module.exports = router; 