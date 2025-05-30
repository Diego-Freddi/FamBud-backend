const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Expense = require('../models/Expense');
const Income = require('../models/Income');
const Budget = require('../models/Budget');
const Category = require('../models/Category');
const mongoose = require('mongoose');

// @route   GET /api/dashboard
// @desc    Get all dashboard data in a single call with optional filters
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const familyId = req.user.familyId;
    const { userId, startDate, endDate } = req.query;
    
    // Debug temporaneo - rimuovere dopo il test
    console.log('Dashboard API - Query params received:', { userId, startDate, endDate });
    
    // Gestione date: default dall'inizio ad oggi se non specificate
    let dateFilter = {};
    if (startDate || endDate) {
      if (startDate) {
        dateFilter.$gte = new Date(startDate);
      }
      if (endDate) {
        // Aggiungi 23:59:59 alla data di fine per includere tutto il giorno
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        dateFilter.$lte = endDateTime;
      }
    }
    
    // Gestione filtro utente
    let userFilter = {};
    if (userId && userId !== 'all') {
      userFilter.userId = new mongoose.Types.ObjectId(userId);
    }
    
    // Base match per tutte le query
    const baseExpenseMatch = {
      familyId: new mongoose.Types.ObjectId(familyId),
      isActive: true,
      ...userFilter
    };
    
    const baseIncomeMatch = {
      familyId: new mongoose.Types.ObjectId(familyId),
      isActive: true,
      ...userFilter
    };
    
    // Aggiungi filtro date se specificato
    if (Object.keys(dateFilter).length > 0) {
      baseExpenseMatch.date = dateFilter;
      baseIncomeMatch.date = dateFilter;
    }

    // Query parallele per massima efficienza
    const [totalExpenses, totalIncomes, expensesByCategory, recentExpenses, recentIncomes] = await Promise.all([
      // Spese totali nel periodo filtrato
      Expense.aggregate([
        { $match: baseExpenseMatch },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' }
          }
        }
      ]),

      // Entrate totali nel periodo filtrato
      Income.aggregate([
        { $match: baseIncomeMatch },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' }
          }
        }
      ]),

      // Spese per categoria nel periodo filtrato
      Expense.aggregate([
        { $match: baseExpenseMatch },
        {
          $lookup: {
            from: 'categories',
            localField: 'category',
            foreignField: '_id',
            as: 'categoryInfo'
          }
        },
        {
          $unwind: '$categoryInfo'
        },
        {
          $group: {
            _id: '$category',
            categoryName: { $first: '$categoryInfo.name' },
            categoryColor: { $first: '$categoryInfo.color' },
            totalAmount: { $sum: '$amount' }
          }
        },
        {
          $sort: { totalAmount: -1 }
        }
      ]),

      // Tutte le spese nel periodo filtrato
      Expense.find(baseExpenseMatch)
        .populate('category', 'name color icon')
        .populate('userId', 'name')
        .sort({ date: -1 })
        .lean(),

      // Tutte le entrate nel periodo filtrato
      Income.find(baseIncomeMatch)
        .populate('userId', 'name')
        .sort({ date: -1 })
        .lean()
    ]);

    // Genera trend mensile (ultimi 6 mesi o periodo personalizzato)
    const monthlyTrendData = {
      labels: [],
      expenses: [],
      incomes: []
    };

    // Se non ci sono filtri di data, usa gli ultimi 6 mesi (comportamento originale)
    if (!startDate && !endDate) {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();
      
      // Calcola gli ultimi 6 mesi
      for (let i = 5; i >= 0; i--) {
        const date = new Date(currentYear, currentMonth - 1 - i, 1);
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        
        const monthName = new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(date);
        monthlyTrendData.labels.push(monthName);
        
        // Match per il mese specifico
        const monthExpenseMatch = {
          ...baseExpenseMatch,
          $expr: {
            $and: [
              { $eq: [{ $month: '$date' }, month] },
              { $eq: [{ $year: '$date' }, year] }
            ]
          }
        };
        
        const monthIncomeMatch = {
          ...baseIncomeMatch,
          $expr: {
            $and: [
              { $eq: [{ $month: '$date' }, month] },
              { $eq: [{ $year: '$date' }, year] }
            ]
          }
        };
        
        // Query per spese del mese
        const monthExpenses = await Expense.aggregate([
          { $match: monthExpenseMatch },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' }
            }
          }
        ]);

        // Query per entrate del mese
        const monthIncomes = await Income.aggregate([
          { $match: monthIncomeMatch },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' }
            }
          }
        ]);
        
        monthlyTrendData.expenses.push(monthExpenses[0]?.total || 0);
        monthlyTrendData.incomes.push(monthIncomes[0]?.total || 0);
      }
    } else {
      // Per periodi personalizzati, raggruppa per mese nel range specificato
      const start = startDate ? new Date(startDate) : new Date('2020-01-01');
      const end = endDate ? new Date(endDate) : new Date();
      
      // Genera mesi nel range
      const current = new Date(start.getFullYear(), start.getMonth(), 1);
      const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
      
      while (current <= endMonth) {
        const month = current.getMonth() + 1;
        const year = current.getFullYear();
        
        const monthName = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' }).format(current);
        monthlyTrendData.labels.push(monthName);
        
        // Match per il mese specifico nel range
        const monthExpenseMatch = {
          ...baseExpenseMatch,
          $expr: {
            $and: [
              { $eq: [{ $month: '$date' }, month] },
              { $eq: [{ $year: '$date' }, year] }
            ]
          }
        };
        
        const monthIncomeMatch = {
          ...baseIncomeMatch,
          $expr: {
            $and: [
              { $eq: [{ $month: '$date' }, month] },
              { $eq: [{ $year: '$date' }, year] }
            ]
          }
        };
        
        const [monthExpenses, monthIncomes] = await Promise.all([
          Expense.aggregate([
            { $match: monthExpenseMatch },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]),
          Income.aggregate([
            { $match: monthIncomeMatch },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ])
        ]);
        
        monthlyTrendData.expenses.push(monthExpenses[0]?.total || 0);
        monthlyTrendData.incomes.push(monthIncomes[0]?.total || 0);
        
        current.setMonth(current.getMonth() + 1);
      }
    }

    // Processa i risultati
    const totalExpenseAmount = totalExpenses[0]?.totalAmount || 0;
    const totalIncomeAmount = totalIncomes[0]?.totalAmount || 0;
    const balance = totalIncomeAmount - totalExpenseAmount;

    // Combina e ordina tutte le transazioni del periodo
    const recentTransactions = [
      ...recentExpenses.map(expense => ({ ...expense, type: 'expense' })),
      ...recentIncomes.map(income => ({ ...income, type: 'income' }))
    ]
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Per i budget, calcoliamo lo stato rispetto al periodo filtrato (default: dall'inizio ad oggi)
    let budgetAlerts = [];
    
    // Ottieni tutti i budget attivi della famiglia
    const allBudgets = await Budget.find({
      familyId: new mongoose.Types.ObjectId(familyId),
      isActive: true
    })
      .populate('categoryId', 'name color icon')
      .lean();

    // Per ogni categoria con budget, calcola quanto è stato speso nel periodo filtrato
    budgetAlerts = allBudgets.map(budget => {
      const categoryExpenses = expensesByCategory.find(exp => 
        exp._id && exp._id.toString() === budget.categoryId._id.toString()
      );
      const spent = categoryExpenses?.totalAmount || 0;
      
      // Calcola la percentuale rispetto al budget mensile
      const percentageUsed = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
      
      let status = 'safe';
      if (percentageUsed >= 100) {
        status = 'exceeded';
      } else if (percentageUsed >= (budget.alertThreshold || 80)) {
        status = 'warning';
      }
      
      return {
        ...budget,
        spent,
        percentageUsed: Math.round(percentageUsed),
        status,
        // Aggiungi info sul periodo di riferimento
        periodInfo: {
          isFiltered: !!(startDate || endDate),
          startDate: startDate || 'dall\'inizio',
          endDate: endDate || 'oggi'
        }
      };
    });

    // Risposta unificata
    const dashboardData = {
      stats: {
        monthlyExpenses: totalExpenseAmount,
        monthlyIncome: totalIncomeAmount,
        balance,
        savings: balance > 0 ? balance : 0
      },
      expensesByCategory: expensesByCategory.map(cat => ({
        categoryName: cat.categoryName,
        totalAmount: cat.totalAmount,
        color: cat.categoryColor
      })),
      monthlyTrend: monthlyTrendData,
      recentTransactions,
      budgetAlerts,
      // Aggiungi info sui filtri applicati
      appliedFilters: {
        userId: userId || null,
        startDate: startDate || null,
        endDate: endDate || null,
        isFiltered: !!(userId || startDate || endDate)
      }
    };

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Dashboard data error:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero dei dati dashboard'
    });
  }
});

module.exports = router; 