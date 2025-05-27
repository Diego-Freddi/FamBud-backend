const express = require('express');
const { body } = require('express-validator');
const {
  getBudgets,
  getBudget,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetSummary,
  autoCreateBudgets,
  refreshBudgetStats
} = require('../controllers/budgetController');
const { authenticate, requireFamilyMember, requireFamilyAdmin } = require('../middleware/auth');

const router = express.Router();

// Middleware: tutte le routes richiedono autenticazione e appartenenza famiglia
router.use(authenticate);
router.use(requireFamilyMember);

// Validazioni per creazione budget
const createBudgetValidation = [
  body('categoryId')
    .isMongoId()
    .withMessage('ID categoria non valido'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('L\'importo deve essere un numero positivo'),
  body('month')
    .isInt({ min: 1, max: 12 })
    .withMessage('Il mese deve essere tra 1 e 12'),
  body('year')
    .isInt({ min: 2020, max: 2030 })
    .withMessage('L\'anno deve essere tra 2020 e 2030'),
  body('alertThreshold')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('La soglia di allerta deve essere tra 0 e 100'),
  body('autoRenew')
    .optional()
    .isBoolean()
    .withMessage('autoRenew deve essere un booleano'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Le note non possono superare i 500 caratteri')
];

// Validazioni per aggiornamento budget
const updateBudgetValidation = [
  body('amount')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('L\'importo deve essere un numero positivo'),
  body('alertThreshold')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('La soglia di allerta deve essere tra 0 e 100'),
  body('autoRenew')
    .optional()
    .isBoolean()
    .withMessage('autoRenew deve essere un booleano'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Le note non possono superare i 500 caratteri')
];

// Validazioni per creazione automatica budget
const autoCreateBudgetsValidation = [
  body('year')
    .optional()
    .isInt({ min: 2020, max: 2030 })
    .withMessage('L\'anno deve essere tra 2020 e 2030'),
  body('month')
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage('Il mese deve essere tra 1 e 12')
];

// @route   GET /api/budgets/summary
// @desc    Ottieni riassunto budget
// @access  Private
router.get('/summary', getBudgetSummary);

// @route   POST /api/budgets/auto-create
// @desc    Crea budget automatici dal mese precedente
// @access  Private (Admin only)
router.post('/auto-create', requireFamilyAdmin, autoCreateBudgetsValidation, autoCreateBudgets);

// @route   POST /api/budgets/refresh-stats
// @desc    Aggiorna tutte le statistiche budget
// @access  Private
router.post('/refresh-stats', refreshBudgetStats);

// @route   GET /api/budgets
// @desc    Ottieni tutti i budget della famiglia
// @access  Private
router.get('/', getBudgets);

// @route   GET /api/budgets/:id
// @desc    Ottieni singolo budget
// @access  Private
router.get('/:id', getBudget);

// @route   POST /api/budgets
// @desc    Crea nuovo budget
// @access  Private (Admin only)
router.post('/', requireFamilyAdmin, createBudgetValidation, createBudget);

// @route   PUT /api/budgets/:id
// @desc    Aggiorna budget
// @access  Private (Admin only)
router.put('/:id', requireFamilyAdmin, updateBudgetValidation, updateBudget);

// @route   DELETE /api/budgets/:id
// @desc    Elimina budget
// @access  Private (Admin only)
router.delete('/:id', requireFamilyAdmin, deleteBudget);

module.exports = router; 