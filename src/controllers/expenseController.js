const Expense = require('../models/Expense');
const Category = require('../models/Category');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

// @desc    Ottieni tutte le spese della famiglia
// @route   GET /api/expenses
// @access  Private
const getExpenses = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { 
      page = 1, 
      limit = 20, 
      category, 
      userId, 
      startDate, 
      endDate,
      search,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;

    // Costruisci filtri
    const filters = { 
      familyId,
      isActive: true
    };

    if (category) filters.category = category;
    if (userId) filters.userId = userId;
    
    if (startDate || endDate) {
      filters.date = {};
      if (startDate) filters.date.$gte = new Date(startDate);
      if (endDate) filters.date.$lte = new Date(endDate);
    }

    if (search) {
      filters.$text = { $search: search };
    }

    // Opzioni di ordinamento
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calcola skip per paginazione
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Query con populate
    const expenses = await Expense.find(filters)
      .populate('category', 'name color icon')
      .populate('userId', 'name email avatar')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    // Conta totale per paginazione
    const total = await Expense.countDocuments(filters);

    // Statistiche rapide
    const stats = await Expense.aggregate([
      { $match: filters },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          avgAmount: { $avg: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        expenses,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total,
          limit: parseInt(limit)
        },
        stats: stats[0] || { totalAmount: 0, avgAmount: 0, count: 0 }
      }
    });

  } catch (error) {
    logger.error('Get expenses error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel recupero delle spese'
    });
  }
};

// @desc    Ottieni singola spesa
// @route   GET /api/expenses/:id
// @access  Private
const getExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId } = req.user;

    const expense = await Expense.findOne({ 
      _id: id, 
      familyId,
      isActive: true 
    })
    .populate('category', 'name color icon')
    .populate('userId', 'name email avatar');

    if (!expense) {
      return res.status(404).json({
        error: 'Spesa non trovata',
        message: 'La spesa richiesta non esiste o non hai i permessi per visualizzarla'
      });
    }

    res.json({
      success: true,
      data: { expense }
    });

  } catch (error) {
    logger.error('Get expense error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel recupero della spesa'
    });
  }
};

// @desc    Crea nuova spesa
// @route   POST /api/expenses
// @access  Private
const createExpense = async (req, res) => {
  try {
    // Validazione input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.array().map(err => err.msg).join(', ')
      });
    }

    const { familyId } = req.user;
    const { 
      amount, 
      description, 
      category, 
      date,
      tags,
      notes,
      location,
      receipt
    } = req.body;

    // Verifica che la categoria appartenga alla famiglia
    const categoryDoc = await Category.findOne({
      _id: category,
      $or: [
        { isDefault: true },
        { familyId: familyId }
      ],
      isActive: true
    });

    if (!categoryDoc) {
      return res.status(400).json({
        error: 'Categoria non valida',
        message: 'La categoria selezionata non è valida per questa famiglia'
      });
    }

    // Crea nuova spesa
    const expense = new Expense({
      amount,
      description,
      category,
      date: date || new Date(),
      userId: req.user._id,
      familyId,
      tags: tags || [],
      notes: notes || '',
      location: location || undefined,
      receipt: receipt || undefined
    });

    await expense.save();

    // Popola i dati per la risposta
    await expense.populate('category', 'name color icon');
    await expense.populate('userId', 'name email avatar');

    logger.info(`New expense created: ${amount}€ by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Spesa creata con successo',
      data: { expense }
    });

  } catch (error) {
    logger.error('Create expense error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.join(', ')
      });
    }

    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante la creazione della spesa'
    });
  }
};

// @desc    Aggiorna spesa
// @route   PUT /api/expenses/:id
// @access  Private
const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId } = req.user;

    // Trova la spesa
    const expense = await Expense.findOne({ 
      _id: id, 
      familyId,
      isActive: true 
    });

    if (!expense) {
      return res.status(404).json({
        error: 'Spesa non trovata',
        message: 'La spesa richiesta non esiste'
      });
    }

    // Verifica permessi (solo il creatore o admin famiglia)
    if (expense.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Non hai i permessi per modificare questa spesa'
      });
    }

    const { 
      amount, 
      description, 
      category, 
      date,
      tags,
      notes,
      location,
      receipt
    } = req.body;

    // Se la categoria è cambiata, verificala
    if (category && category !== expense.category.toString()) {
      const categoryDoc = await Category.findOne({
        _id: category,
        $or: [
          { isDefault: true },
          { familyId: familyId }
        ],
        isActive: true
      });

      if (!categoryDoc) {
        return res.status(400).json({
          error: 'Categoria non valida',
          message: 'La categoria selezionata non è valida per questa famiglia'
        });
      }
    }

    // Aggiorna campi
    if (amount !== undefined) expense.amount = amount;
    if (description !== undefined) expense.description = description;
    if (category !== undefined) expense.category = category;
    if (date !== undefined) expense.date = date;
    if (tags !== undefined) expense.tags = tags;
    if (notes !== undefined) expense.notes = notes;
    if (location !== undefined) expense.location = location;
    if (receipt !== undefined) expense.receipt = receipt;

    await expense.save();

    // Popola i dati per la risposta
    await expense.populate('category', 'name color icon');
    await expense.populate('userId', 'name email avatar');

    logger.info(`Expense updated: ${id} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Spesa aggiornata con successo',
      data: { expense }
    });

  } catch (error) {
    logger.error('Update expense error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.join(', ')
      });
    }

    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'aggiornamento della spesa'
    });
  }
};

// @desc    Elimina spesa
// @route   DELETE /api/expenses/:id
// @access  Private
const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId } = req.user;

    // Trova la spesa
    const expense = await Expense.findOne({ 
      _id: id, 
      familyId,
      isActive: true 
    });

    if (!expense) {
      return res.status(404).json({
        error: 'Spesa non trovata',
        message: 'La spesa richiesta non esiste'
      });
    }

    // Verifica permessi (solo il creatore o admin famiglia)
    if (expense.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Non hai i permessi per eliminare questa spesa'
      });
    }

    // Soft delete
    expense.isActive = false;
    await expense.save();

    logger.info(`Expense deleted: ${id} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Spesa eliminata con successo'
    });

  } catch (error) {
    logger.error('Delete expense error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'eliminazione della spesa'
    });
  }
};

// @desc    Ottieni statistiche spese
// @route   GET /api/expenses/stats
// @access  Private
const getExpenseStats = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { year, month } = req.query;

    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

    // Statistiche mensili
    const monthlyStats = await Expense.getMonthlyStats(familyId, currentYear, currentMonth);
    
    // Statistiche annuali
    const yearlyStats = await Expense.getYearlyStats(familyId, currentYear);

    res.json({
      success: true,
      data: {
        monthly: monthlyStats,
        yearly: yearlyStats,
        period: {
          year: currentYear,
          month: currentMonth
        }
      }
    });

  } catch (error) {
    logger.error('Get expense stats error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel recupero delle statistiche'
    });
  }
};

module.exports = {
  getExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats
}; 