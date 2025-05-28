const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  categoryId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Category',
    required: [true, 'La categoria è obbligatoria']
  },
  
  amount: {
    type: Number,
    required: [true, 'L\'importo del budget è obbligatorio'],
    min: [0, 'L\'importo deve essere maggiore o uguale a 0'],
    max: [999999.99, 'L\'importo non può superare 999.999,99']
  },
  
  month: {
    type: Number,
    required: [true, 'Il mese è obbligatorio'],
    min: [1, 'Il mese deve essere tra 1 e 12'],
    max: [12, 'Il mese deve essere tra 1 e 12']
  },
  
  year: {
    type: Number,
    required: [true, 'L\'anno è obbligatorio'],
    min: [2020, 'L\'anno deve essere maggiore di 2020'],
    max: [2050, 'L\'anno non può superare il 2050']
  },
  
  familyId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Family',
    required: [true, 'La famiglia è obbligatoria']
  },
  
  // Statistiche budget
  spent: {
    type: Number,
    default: 0,
    min: [0, 'La spesa non può essere negativa']
  },
  
  remaining: {
    type: Number,
    default: function() {
      return this.amount - this.spent;
    }
  },
  
  percentageUsed: {
    type: Number,
    default: 0,
    min: [0, 'La percentuale non può essere negativa'],
    max: [1000, 'La percentuale non può superare il 1000%'] // Permette sforamento
  },
  
  // Configurazioni budget
  alertThreshold: {
    type: Number,
    default: 80, // Avviso al 80%
    min: [0, 'La soglia deve essere tra 0 e 100'],
    max: [100, 'La soglia deve essere tra 0 e 100']
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Metadati
  notes: {
    type: String,
    trim: true,
    maxlength: [300, 'Le note non possono superare i 300 caratteri']
  },
  
  // Ricorrenza automatica
  autoRenew: {
    type: Boolean,
    default: true
  },
  
  // Storico modifiche
  history: [{
    amount: {
      type: Number,
      required: true
    },
    changedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [100, 'Il motivo non può superare i 100 caratteri']
    }
  }]

}, {
  timestamps: true
});

// Index per performance e unicità
budgetSchema.index({ familyId: 1, categoryId: 1, year: 1, month: 1 }, { unique: true });
budgetSchema.index({ familyId: 1, year: 1, month: 1 });
budgetSchema.index({ categoryId: 1, year: 1, month: 1 });
budgetSchema.index({ familyId: 1, isActive: 1 });

// Virtual per il periodo
budgetSchema.virtual('period').get(function() {
  return `${this.year}-${String(this.month).padStart(2, '0')}`;
});

// Virtual per lo stato del budget
budgetSchema.virtual('status').get(function() {
  if (this.percentageUsed >= 100) return 'exceeded';
  if (this.percentageUsed >= this.alertThreshold) return 'warning';
  if (this.percentageUsed >= 50) return 'normal';
  return 'safe';
});

// Metodo per formattare l'importo
budgetSchema.methods.getFormattedAmount = function(currency = 'EUR') {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency
  }).format(this.amount);
};

// Metodo per formattare la spesa
budgetSchema.methods.getFormattedSpent = function(currency = 'EUR') {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency
  }).format(this.spent);
};

// Metodo per formattare il rimanente
budgetSchema.methods.getFormattedRemaining = function(currency = 'EUR') {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency
  }).format(this.remaining);
};

// Metodo per aggiornare le statistiche
budgetSchema.methods.updateStats = async function() {
  const Expense = require('./Expense');
  const mongoose = require('mongoose');
  
  const startDate = new Date(this.year, this.month - 1, 1);
  const endDate = new Date(this.year, this.month, 0, 23, 59, 59);
  
  // Assicuriamoci che categoryId sia un ObjectId
  const categoryObjectId = mongoose.Types.ObjectId.isValid(this.categoryId) 
    ? new mongoose.Types.ObjectId(this.categoryId) 
    : this.categoryId;
  
  const stats = await Expense.aggregate([
    {
      $match: {
        familyId: this.familyId,
        category: categoryObjectId,
        date: { $gte: startDate, $lte: endDate },
        isActive: true
      }
    },
    {
      $group: {
        _id: null,
        totalSpent: { $sum: '$amount' }
      }
    }
  ]);
  
  this.spent = stats.length > 0 ? stats[0].totalSpent : 0;
  this.remaining = this.amount - this.spent;
  this.percentageUsed = this.amount > 0 ? (this.spent / this.amount) * 100 : 0;
  
  return this.save();
};

// Metodo per aggiungere una modifica alla cronologia
budgetSchema.methods.addToHistory = function(newAmount, userId, reason = '') {
  this.history.push({
    amount: newAmount,
    changedBy: userId,
    reason: reason
  });
  
  // Mantieni solo gli ultimi 10 cambiamenti
  if (this.history.length > 10) {
    this.history = this.history.slice(-10);
  }
  
  return this;
};

// Metodi statici
budgetSchema.statics.getBudgetsForMonth = async function(familyId, year, month) {
  return await this.find({
    familyId: familyId,
    year: year,
    month: month,
    isActive: true
  }).populate('categoryId', 'name color icon').sort({ 'categoryId.order': 1, 'categoryId.name': 1 });
};

budgetSchema.statics.getBudgetsForYear = async function(familyId, year) {
  return await this.find({
    familyId: familyId,
    year: year,
    isActive: true
  }).populate('categoryId', 'name color icon').sort({ month: 1, 'categoryId.order': 1 });
};

budgetSchema.statics.getBudgetSummary = async function(familyId, year, month) {
  const budgets = await this.getBudgetsForMonth(familyId, year, month);
  
  const summary = {
    totalBudget: 0,
    totalSpent: 0,
    totalRemaining: 0,
    averageUsage: 0,
    budgetsExceeded: 0,
    budgetsWarning: 0,
    budgetsSafe: 0,
    categories: budgets.length
  };
  
  budgets.forEach(budget => {
    summary.totalBudget += budget.amount;
    summary.totalSpent += budget.spent;
    summary.totalRemaining += budget.remaining;
    
    if (budget.status === 'exceeded') summary.budgetsExceeded++;
    else if (budget.status === 'warning') summary.budgetsWarning++;
    else summary.budgetsSafe++;
  });
  
  summary.averageUsage = summary.totalBudget > 0 ? 
    (summary.totalSpent / summary.totalBudget) * 100 : 0;
  
  return summary;
};

// Metodo statico per creare budget automatici dal mese precedente
budgetSchema.statics.createFromPreviousMonth = async function(familyId, year, month) {
  let prevYear = year;
  let prevMonth = month - 1;
  
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = year - 1;
  }
  
  const previousBudgets = await this.find({
    familyId: familyId,
    year: prevYear,
    month: prevMonth,
    isActive: true,
    autoRenew: true
  });
  
  const newBudgets = [];
  
  for (const prevBudget of previousBudgets) {
    // Controlla se esiste già un budget per questa categoria nel nuovo mese
    const existingBudget = await this.findOne({
      familyId: familyId,
      categoryId: prevBudget.categoryId,
      year: year,
      month: month
    });
    
    if (!existingBudget) {
      const newBudget = new this({
        categoryId: prevBudget.categoryId,
        amount: prevBudget.amount,
        month: month,
        year: year,
        familyId: familyId,
        alertThreshold: prevBudget.alertThreshold,
        autoRenew: prevBudget.autoRenew,
        notes: `Budget automatico da ${prevYear}-${String(prevMonth).padStart(2, '0')}`
      });
      
      newBudgets.push(await newBudget.save());
    }
  }
  
  return newBudgets;
};

// Middleware pre-save per aggiornare remaining e percentageUsed
budgetSchema.pre('save', function(next) {
  this.remaining = this.amount - this.spent;
  this.percentageUsed = this.amount > 0 ? (this.spent / this.amount) * 100 : 0;
  next();
});

// Middleware post-save per aggiornare statistiche quando cambia l'importo
budgetSchema.post('save', async function(doc) {
  if (doc.isModified('amount')) {
    await doc.updateStats();
  }
});

module.exports = mongoose.model('Budget', budgetSchema); 