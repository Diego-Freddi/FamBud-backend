const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Expense = require('../models/Expense');
const Income = require('../models/Income');
const Budget = require('../models/Budget');
const Category = require('../models/Category');

// @route   GET /api/dashboard
// @desc    Get all dashboard data in a single call
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const familyId = req.user.familyId;
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Query parallele per massima efficienza
    const [monthlyExpenses, monthlyIncomes, expensesByCategory, recentExpenses, recentIncomes, budgets] = await Promise.all([
      // Spese mensili correnti
      Expense.aggregate([
        {
          $match: {
            familyId,
            $expr: {
              $and: [
                { $eq: [{ $month: '$date' }, currentMonth] },
                { $eq: [{ $year: '$date' }, currentYear] }
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]),

      // Entrate mensili correnti
      Income.aggregate([
        {
          $match: {
            familyId,
            $expr: {
              $and: [
                { $eq: [{ $month: '$date' }, currentMonth] },
                { $eq: [{ $year: '$date' }, currentYear] }
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]),

      // Spese per categoria (mese corrente)
      Expense.aggregate([
        {
          $match: {
            familyId,
            $expr: {
              $and: [
                { $eq: [{ $month: '$date' }, currentMonth] },
                { $eq: [{ $year: '$date' }, currentYear] }
              ]
            }
          }
        },
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
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { totalAmount: -1 }
        }
      ]),

      // Ultime 5 spese
      Expense.find({ familyId })
        .populate('category', 'name color icon')
        .populate('userId', 'name')
        .sort({ date: -1 })
        .limit(5)
        .lean(),

      // Ultime 5 entrate
      Income.find({ familyId })
        .populate('userId', 'name')
        .sort({ date: -1 })
        .limit(5)
        .lean(),

      // Budget del mese corrente
      Budget.find({
        familyId,
        month: currentMonth,
        year: currentYear
      })
        .populate('categoryId', 'name color icon')
        .lean()
    ]);

    // Genera trend mensile reale (ultimi 6 mesi)
    const monthlyTrendData = {
      labels: [],
      expenses: [],
      incomes: []
    };

    // Calcola gli ultimi 6 mesi
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentYear, currentMonth - 1 - i, 1);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      
      const monthName = new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(date);
      monthlyTrendData.labels.push(monthName);
      
      // Query per spese del mese
      const monthExpenses = await Expense.aggregate([
        {
          $match: {
            familyId,
            $expr: {
              $and: [
                { $eq: [{ $month: '$date' }, month] },
                { $eq: [{ $year: '$date' }, year] }
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ]);

      // Query per entrate del mese
      const monthIncomes = await Income.aggregate([
        {
          $match: {
            familyId,
            $expr: {
              $and: [
                { $eq: [{ $month: '$date' }, month] },
                { $eq: [{ $year: '$date' }, year] }
              ]
            }
          }
        },
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

    // Processa i risultati
    const monthlyExpenseAmount = monthlyExpenses[0]?.totalAmount || 0;
    const monthlyIncomeAmount = monthlyIncomes[0]?.totalAmount || 0;
    const balance = monthlyIncomeAmount - monthlyExpenseAmount;

    // Combina e ordina le transazioni recenti
    const recentTransactions = [
      ...recentExpenses.map(expense => ({ ...expense, type: 'expense' })),
      ...recentIncomes.map(income => ({ ...income, type: 'income' }))
    ]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    // Calcola percentuali budget e stati
    const budgetAlerts = budgets.map(budget => {
      const categoryExpenses = expensesByCategory.find(exp => 
        exp._id && exp._id.toString() === budget.categoryId._id.toString()
      );
      const spent = categoryExpenses?.totalAmount || 0;
      
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
        status
      };
    });

    // Risposta unificata
    const dashboardData = {
      stats: {
        monthlyExpenses: monthlyExpenseAmount,
        monthlyIncome: monthlyIncomeAmount,
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
      budgetAlerts
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