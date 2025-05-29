const Income = require('../models/Income');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

// @desc    Ottieni tutte le entrate della famiglia
// @route   GET /api/incomes
// @access  Private
const getIncomes = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { 
      page = 1, 
      limit = 20, 
      source, 
      userId, 
      startDate, 
      endDate,
      search,
      isRecurring,
      minAmount,
      maxAmount,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;

    // Costruisci filtri
    const filters = { 
      familyId,
      isActive: true
    };

    if (source) filters.source = source;
    if (userId) {
      // Converti userId da stringa a ObjectId
      filters.userId = new mongoose.Types.ObjectId(userId);
    }
    if (isRecurring !== undefined) filters.isRecurring = isRecurring === 'true';
    
    if (startDate || endDate) {
      filters.date = {};
      if (startDate) filters.date.$gte = new Date(startDate);
      if (endDate) filters.date.$lte = new Date(endDate);
    }

    if (minAmount || maxAmount) {
      filters.amount = {};
      if (minAmount) filters.amount.$gte = parseFloat(minAmount);
      if (maxAmount) filters.amount.$lte = parseFloat(maxAmount);
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
    const incomes = await Income.find(filters)
      .populate('userId', 'name email avatar')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    // Conta totale per paginazione
    const total = await Income.countDocuments(filters);

    // Statistiche rapide
    const stats = await Income.aggregate([
      { $match: filters },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          avgAmount: { $avg: '$amount' },
          count: { $sum: 1 },
          totalNet: { 
            $sum: { 
              $subtract: ['$amount', { $ifNull: ['$taxInfo.withholdingTax', 0] }] 
            } 
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        incomes,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total,
          limit: parseInt(limit)
        },
        stats: stats[0] || { totalAmount: 0, avgAmount: 0, count: 0, totalNet: 0 }
      }
    });

  } catch (error) {
    logger.error('Get incomes error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel recupero delle entrate'
    });
  }
};

// @desc    Ottieni singola entrata
// @route   GET /api/incomes/:id
// @access  Private
const getIncome = async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId } = req.user;

    const income = await Income.findOne({ 
      _id: id, 
      familyId,
      isActive: true 
    }).populate('userId', 'name email avatar');

    if (!income) {
      return res.status(404).json({
        error: 'Entrata non trovata',
        message: 'L\'entrata richiesta non esiste o non hai i permessi per visualizzarla'
      });
    }

    res.json({
      success: true,
      data: { income }
    });

  } catch (error) {
    logger.error('Get income error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel recupero dell\'entrata'
    });
  }
};

// @desc    Crea nuova entrata
// @route   POST /api/incomes
// @access  Private
const createIncome = async (req, res) => {
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
      source, 
      date,
      tags,
      notes,
      taxInfo,
      isRecurring,
      recurringPattern
    } = req.body;

    // Crea nuova entrata
    const income = new Income({
      amount,
      description,
      source,
      date: date || new Date(),
      userId: req.user._id,
      familyId,
      tags: tags || [],
      notes: notes || '',
      taxInfo: taxInfo || {},
      isRecurring: isRecurring || false,
      recurringPattern: isRecurring ? recurringPattern : undefined
    });

    await income.save();

    // Popola i dati per la risposta
    await income.populate('userId', 'name email avatar');

    logger.info(`New income created: ${amount}€ by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Entrata creata con successo',
      data: { income }
    });

  } catch (error) {
    logger.error('Create income error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.join(', ')
      });
    }

    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante la creazione dell\'entrata'
    });
  }
};

// @desc    Aggiorna entrata
// @route   PUT /api/incomes/:id
// @access  Private
const updateIncome = async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId } = req.user;

    // Trova l'entrata
    const income = await Income.findOne({ 
      _id: id, 
      familyId,
      isActive: true 
    });

    if (!income) {
      return res.status(404).json({
        error: 'Entrata non trovata',
        message: 'L\'entrata richiesta non esiste'
      });
    }

    // Verifica permessi (solo il creatore o admin famiglia)
    if (income.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Non hai i permessi per modificare questa entrata'
      });
    }

    const { 
      amount, 
      description, 
      source, 
      date,
      tags,
      notes,
      taxInfo,
      isRecurring,
      recurringPattern
    } = req.body;

    // Aggiorna campi
    if (amount !== undefined) income.amount = amount;
    if (description !== undefined) income.description = description;
    if (source !== undefined) income.source = source;
    if (date !== undefined) income.date = date;
    if (tags !== undefined) income.tags = tags;
    if (notes !== undefined) income.notes = notes;
    if (taxInfo !== undefined) income.taxInfo = taxInfo;
    if (isRecurring !== undefined) {
      income.isRecurring = isRecurring;
      if (isRecurring && recurringPattern) {
        income.recurringPattern = recurringPattern;
      } else if (!isRecurring) {
        income.recurringPattern = undefined;
      }
    }

    await income.save();

    // Popola i dati per la risposta
    await income.populate('userId', 'name email avatar');

    logger.info(`Income updated: ${id} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Entrata aggiornata con successo',
      data: { income }
    });

  } catch (error) {
    logger.error('Update income error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.join(', ')
      });
    }

    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'aggiornamento dell\'entrata'
    });
  }
};

// @desc    Elimina entrata
// @route   DELETE /api/incomes/:id
// @access  Private
const deleteIncome = async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId } = req.user;

    // Trova l'entrata
    const income = await Income.findOne({ 
      _id: id, 
      familyId,
      isActive: true 
    });

    if (!income) {
      return res.status(404).json({
        error: 'Entrata non trovata',
        message: 'L\'entrata richiesta non esiste'
      });
    }

    // Verifica permessi (solo il creatore o admin famiglia)
    if (income.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Non hai i permessi per eliminare questa entrata'
      });
    }

    // Soft delete
    income.isActive = false;
    await income.save();

    logger.info(`Income deleted: ${id} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Entrata eliminata con successo'
    });

  } catch (error) {
    logger.error('Delete income error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'eliminazione dell\'entrata'
    });
  }
};

// @desc    Ottieni statistiche entrate
// @route   GET /api/incomes/stats
// @access  Private
const getIncomeStats = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { year, month } = req.query;

    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

    // Statistiche mensili
    const monthlyStats = await Income.getMonthlyStats(familyId, currentYear, currentMonth);
    
    // Statistiche annuali
    const yearlyStats = await Income.getYearlyStats(familyId, currentYear);

    // Calcola totali per il frontend
    const totalAmount = monthlyStats.reduce((sum, stat) => sum + stat.totalAmount, 0);
    const totalCount = monthlyStats.reduce((sum, stat) => sum + stat.count, 0);
    const avgAmount = totalCount > 0 ? totalAmount / totalCount : 0;

    // Formatta dati per fonte per il frontend
    const bySource = monthlyStats.map(stat => ({
      _id: stat._id,
      source: stat._id, // La fonte è l'_id nel gruppo
      totalAmount: stat.totalAmount,
      count: stat.count,
      percentage: totalAmount > 0 ? (stat.totalAmount / totalAmount) * 100 : 0
    }));

    res.json({
      success: true,
      data: {
        // Struttura compatibile con il frontend
        totalAmount,
        avgAmount,
        count: totalCount,
        bySource,
        
        // Dati dettagliati
        monthly: monthlyStats,
        yearly: yearlyStats,
        period: {
          year: currentYear,
          month: currentMonth
        }
      }
    });

  } catch (error) {
    logger.error('Get income stats error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel recupero delle statistiche'
    });
  }
};

// @desc    Processa entrate ricorrenti
// @route   POST /api/incomes/process-recurring
// @access  Private (Admin only)
const processRecurringIncomes = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin possono processare le entrate ricorrenti'
      });
    }

    const recurringIncomes = await Income.getRecurringIncomesDue();
    const processedIncomes = [];

    for (const income of recurringIncomes) {
      try {
        const newIncome = await income.createNextRecurrence();
        if (newIncome) {
          processedIncomes.push(newIncome);
        }
      } catch (error) {
        logger.error(`Error processing recurring income ${income._id}:`, error);
      }
    }

    logger.info(`Processed ${processedIncomes.length} recurring incomes`);

    res.json({
      success: true,
      message: `${processedIncomes.length} entrate ricorrenti processate`,
      data: { processedIncomes }
    });

  } catch (error) {
    logger.error('Process recurring incomes error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel processamento delle entrate ricorrenti'
    });
  }
};

module.exports = {
  getIncomes,
  getIncome,
  createIncome,
  updateIncome,
  deleteIncome,
  getIncomeStats,
  processRecurringIncomes
}; 