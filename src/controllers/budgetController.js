const Budget = require('../models/Budget');
const Category = require('../models/Category');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

// @desc    Ottieni tutti i budget della famiglia
// @route   GET /api/budgets
// @access  Private
const getBudgets = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { year, month } = req.query;

    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

    let budgets;
    if (month) {
      // Budget per un mese specifico
      budgets = await Budget.getBudgetsForMonth(familyId, currentYear, currentMonth);
    } else {
      // Budget per tutto l'anno
      budgets = await Budget.getBudgetsForYear(familyId, currentYear);
    }

    // Aggiorna le statistiche per ogni budget
    await Promise.all(budgets.map(budget => budget.updateStats()));

    res.json({
      success: true,
      data: {
        budgets,
        period: {
          year: currentYear,
          month: currentMonth
        }
      }
    });

  } catch (error) {
    logger.error('Get budgets error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel recupero dei budget'
    });
  }
};

// @desc    Ottieni singolo budget
// @route   GET /api/budgets/:id
// @access  Private
const getBudget = async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId } = req.user;

    const budget = await Budget.findOne({
      _id: id,
      familyId,
      isActive: true
    }).populate('categoryId', 'name color icon');

    if (!budget) {
      return res.status(404).json({
        error: 'Budget non trovato',
        message: 'Il budget richiesto non esiste o non hai i permessi per visualizzarlo'
      });
    }

    // Aggiorna statistiche
    await budget.updateStats();

    res.json({
      success: true,
      data: { budget }
    });

  } catch (error) {
    logger.error('Get budget error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel recupero del budget'
    });
  }
};

// @desc    Crea nuovo budget
// @route   POST /api/budgets
// @access  Private
const createBudget = async (req, res) => {
  try {
    // Validazione input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.array().map(err => err.msg).join(', ')
      });
    }

    // Solo admin famiglia può creare budget
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono creare budget'
      });
    }

    const { familyId } = req.user;
    const { 
      categoryId, 
      amount, 
      month, 
      year, 
      alertThreshold,
      autoRenew,
      notes
    } = req.body;

    // Verifica che la categoria appartenga alla famiglia
    const category = await Category.findOne({
      _id: categoryId,
      $or: [
        { isDefault: true },
        { familyId: familyId }
      ],
      isActive: true
    });

    if (!category) {
      return res.status(400).json({
        error: 'Categoria non valida',
        message: 'La categoria selezionata non è valida per questa famiglia'
      });
    }

    // Verifica che non esista già un budget per questa categoria/mese/anno
    const existingBudget = await Budget.findOne({
      categoryId,
      month,
      year,
      familyId,
      isActive: true
    });

    if (existingBudget) {
      return res.status(400).json({
        error: 'Budget già esistente',
        message: 'Esiste già un budget per questa categoria nel periodo specificato'
      });
    }

    // Crea nuovo budget
    const budget = new Budget({
      categoryId,
      amount,
      month,
      year,
      familyId,
      alertThreshold: alertThreshold || 80,
      autoRenew: autoRenew !== undefined ? autoRenew : true,
      notes: notes || ''
    });

    await budget.save();

    // Popola i dati per la risposta
    await budget.populate('categoryId', 'name color icon');

    // Aggiorna statistiche
    await budget.updateStats();

    logger.info(`New budget created: ${amount}€ for ${category.name} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Budget creato con successo',
      data: { budget }
    });

  } catch (error) {
    logger.error('Create budget error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.join(', ')
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        error: 'Budget già esistente',
        message: 'Esiste già un budget per questa categoria nel periodo specificato'
      });
    }

    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante la creazione del budget'
    });
  }
};

// @desc    Aggiorna budget
// @route   PUT /api/budgets/:id
// @access  Private
const updateBudget = async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId } = req.user;

    // Solo admin famiglia può modificare budget
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono modificare i budget'
      });
    }

    // Trova il budget
    const budget = await Budget.findOne({
      _id: id,
      familyId,
      isActive: true
    });

    if (!budget) {
      return res.status(404).json({
        error: 'Budget non trovato',
        message: 'Il budget richiesto non esiste'
      });
    }

    const { 
      amount, 
      alertThreshold,
      autoRenew,
      notes
    } = req.body;

    // Salva l'importo precedente per la cronologia
    const previousAmount = budget.amount;

    // Aggiorna campi
    if (amount !== undefined && amount !== previousAmount) {
      budget.addToHistory(amount, req.user._id, 'Aggiornamento manuale');
      budget.amount = amount;
    }
    if (alertThreshold !== undefined) budget.alertThreshold = alertThreshold;
    if (autoRenew !== undefined) budget.autoRenew = autoRenew;
    if (notes !== undefined) budget.notes = notes;

    await budget.save();

    // Popola i dati per la risposta
    await budget.populate('categoryId', 'name color icon');

    // Aggiorna statistiche
    await budget.updateStats();

    logger.info(`Budget updated: ${id} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Budget aggiornato con successo',
      data: { budget }
    });

  } catch (error) {
    logger.error('Update budget error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.join(', ')
      });
    }

    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'aggiornamento del budget'
    });
  }
};

// @desc    Elimina budget
// @route   DELETE /api/budgets/:id
// @access  Private
const deleteBudget = async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId } = req.user;

    // Solo admin famiglia può eliminare budget
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono eliminare i budget'
      });
    }

    // Trova il budget
    const budget = await Budget.findOne({
      _id: id,
      familyId,
      isActive: true
    });

    if (!budget) {
      return res.status(404).json({
        error: 'Budget non trovato',
        message: 'Il budget richiesto non esiste'
      });
    }

    // Soft delete
    budget.isActive = false;
    await budget.save();

    logger.info(`Budget deleted: ${id} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Budget eliminato con successo'
    });

  } catch (error) {
    logger.error('Delete budget error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'eliminazione del budget'
    });
  }
};

// @desc    Ottieni riassunto budget
// @route   GET /api/budgets/summary
// @access  Private
const getBudgetSummary = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { year, month } = req.query;

    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

    const summary = await Budget.getBudgetSummary(familyId, currentYear, currentMonth);

    res.json({
      success: true,
      data: {
        summary,
        period: {
          year: currentYear,
          month: currentMonth
        }
      }
    });

  } catch (error) {
    logger.error('Get budget summary error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel recupero del riassunto budget'
    });
  }
};

// @desc    Crea budget automatici dal mese precedente
// @route   POST /api/budgets/auto-create
// @access  Private
const autoCreateBudgets = async (req, res) => {
  try {
    // Solo admin famiglia può creare budget automatici
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono creare budget automatici'
      });
    }

    const { familyId } = req.user;
    const { year, month } = req.body;

    const targetYear = year || new Date().getFullYear();
    const targetMonth = month || new Date().getMonth() + 1;

    const newBudgets = await Budget.createFromPreviousMonth(familyId, targetYear, targetMonth);

    logger.info(`Auto-created ${newBudgets.length} budgets for ${targetYear}-${targetMonth} by ${req.user.email}`);

    res.json({
      success: true,
      message: `${newBudgets.length} budget creati automaticamente`,
      data: { budgets: newBudgets }
    });

  } catch (error) {
    logger.error('Auto create budgets error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante la creazione automatica dei budget'
    });
  }
};

// @desc    Aggiorna tutte le statistiche budget
// @route   POST /api/budgets/refresh-stats
// @access  Private
const refreshBudgetStats = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { year, month } = req.query;

    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

    // Ottieni tutti i budget per il periodo
    const budgets = await Budget.getBudgetsForMonth(familyId, currentYear, currentMonth);

    // Aggiorna le statistiche per ogni budget
    const updatePromises = budgets.map(budget => budget.updateStats());
    await Promise.all(updatePromises);

    logger.info(`Refreshed stats for ${budgets.length} budgets by ${req.user.email}`);

    res.json({
      success: true,
      message: `Statistiche aggiornate per ${budgets.length} budget`,
      data: { updatedCount: budgets.length }
    });

  } catch (error) {
    logger.error('Refresh budget stats error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'aggiornamento delle statistiche'
    });
  }
};

module.exports = {
  getBudgets,
  getBudget,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetSummary,
  autoCreateBudgets,
  refreshBudgetStats
}; 