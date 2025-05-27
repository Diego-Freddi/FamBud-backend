const express = require('express');
const { body } = require('express-validator');
const {
  getIncomes,
  getIncome,
  createIncome,
  updateIncome,
  deleteIncome,
  getIncomeStats,
  processRecurringIncomes
} = require('../controllers/incomeController');
const { authenticate, requireFamilyMember, requireFamilyAdmin } = require('../middleware/auth');

const router = express.Router();

// Middleware: tutte le routes richiedono autenticazione e appartenenza famiglia
router.use(authenticate);
router.use(requireFamilyMember);

// Validazioni per creazione entrata
const createIncomeValidation = [
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('L\'importo deve essere un numero positivo'),
  body('description')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('La descrizione è obbligatoria e non può superare i 200 caratteri'),
  body('source')
    .isIn(['salary', 'freelance', 'bonus', 'investment', 'rental', 'gift', 'refund', 'other'])
    .withMessage('Fonte di entrata non valida'),
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
  body('taxInfo.withholdingTax')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('La ritenuta d\'acconto deve essere un numero positivo'),
  body('taxInfo.socialSecurity')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('I contributi previdenziali devono essere un numero positivo'),
  body('isRecurring')
    .optional()
    .isBoolean()
    .withMessage('isRecurring deve essere un booleano'),
  body('recurringPattern.frequency')
    .if(body('isRecurring').equals(true))
    .isIn(['monthly', 'quarterly', 'yearly'])
    .withMessage('Frequenza ricorrenza non valida'),
  body('recurringPattern.dayOfMonth')
    .if(body('isRecurring').equals(true))
    .isInt({ min: 1, max: 31 })
    .withMessage('Giorno del mese deve essere tra 1 e 31')
];

// Validazioni per aggiornamento entrata
const updateIncomeValidation = [
  body('amount')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('L\'importo deve essere un numero positivo'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('La descrizione non può essere vuota o superare i 200 caratteri'),
  body('source')
    .optional()
    .isIn(['salary', 'freelance', 'bonus', 'investment', 'rental', 'gift', 'refund', 'other'])
    .withMessage('Fonte di entrata non valida'),
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
  body('isRecurring')
    .optional()
    .isBoolean()
    .withMessage('isRecurring deve essere un booleano')
];

// @route   GET /api/incomes/stats
// @desc    Ottieni statistiche entrate
// @access  Private
router.get('/stats', getIncomeStats);

// @route   POST /api/incomes/process-recurring
// @desc    Processa entrate ricorrenti
// @access  Private (Admin only)
router.post('/process-recurring', requireFamilyAdmin, processRecurringIncomes);

// @route   GET /api/incomes
// @desc    Ottieni tutte le entrate della famiglia
// @access  Private
router.get('/', getIncomes);

// @route   GET /api/incomes/:id
// @desc    Ottieni singola entrata
// @access  Private
router.get('/:id', getIncome);

// @route   POST /api/incomes
// @desc    Crea nuova entrata
// @access  Private
router.post('/', createIncomeValidation, createIncome);

// @route   PUT /api/incomes/:id
// @desc    Aggiorna entrata
// @access  Private
router.put('/:id', updateIncomeValidation, updateIncome);

// @route   DELETE /api/incomes/:id
// @desc    Elimina entrata
// @access  Private
router.delete('/:id', deleteIncome);

module.exports = router; 