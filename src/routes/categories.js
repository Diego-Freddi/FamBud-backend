const express = require('express');
const { body } = require('express-validator');
const {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryStats,
  reorderCategories
} = require('../controllers/categoryController');
const { authenticate, requireFamilyMember, requireFamilyAdmin } = require('../middleware/auth');

const router = express.Router();

// Middleware: tutte le routes richiedono autenticazione e appartenenza famiglia
router.use(authenticate);
router.use(requireFamilyMember);

// Validazioni per creazione categoria
const createCategoryValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Il nome è obbligatorio e non può superare i 50 caratteri'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('La descrizione non può superare i 200 caratteri'),
  body('color')
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Il colore deve essere un codice esadecimale valido'),
  body('icon')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('L\'icona non può essere vuota o superare i 50 caratteri'),
  body('order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('L\'ordine deve essere un numero intero positivo')
];

// Validazioni per aggiornamento categoria
const updateCategoryValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Il nome non può essere vuoto o superare i 50 caratteri'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('La descrizione non può superare i 200 caratteri'),
  body('color')
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Il colore deve essere un codice esadecimale valido'),
  body('icon')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('L\'icona non può essere vuota o superare i 50 caratteri'),
  body('order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('L\'ordine deve essere un numero intero positivo')
];

// Validazioni per riordinamento categorie
const reorderCategoriesValidation = [
  body('categoryOrders')
    .isArray({ min: 1 })
    .withMessage('categoryOrders deve essere un array non vuoto'),
  body('categoryOrders.*.id')
    .isMongoId()
    .withMessage('ID categoria non valido'),
  body('categoryOrders.*.order')
    .isInt({ min: 0 })
    .withMessage('L\'ordine deve essere un numero intero positivo')
];

// @route   GET /api/categories/stats
// @desc    Ottieni statistiche categorie
// @access  Private
router.get('/stats', getCategoryStats);

// @route   PUT /api/categories/reorder
// @desc    Aggiorna ordine categorie
// @access  Private (Admin only)
router.put('/reorder', requireFamilyAdmin, reorderCategoriesValidation, reorderCategories);

// @route   GET /api/categories
// @desc    Ottieni tutte le categorie della famiglia
// @access  Private
router.get('/', getCategories);

// @route   GET /api/categories/:id
// @desc    Ottieni singola categoria
// @access  Private
router.get('/:id', getCategory);

// @route   POST /api/categories
// @desc    Crea nuova categoria
// @access  Private
router.post('/', createCategoryValidation, createCategory);

// @route   PUT /api/categories/:id
// @desc    Aggiorna categoria
// @access  Private (Admin only)
router.put('/:id', requireFamilyAdmin, updateCategoryValidation, updateCategory);

// @route   DELETE /api/categories/:id
// @desc    Elimina categoria
// @access  Private (Admin only)
router.delete('/:id', requireFamilyAdmin, deleteCategory);

module.exports = router; 