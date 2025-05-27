const mongoose = require('mongoose');

const incomeSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: [true, 'L\'importo è obbligatorio'],
    min: [0.01, 'L\'importo deve essere maggiore di 0'],
    max: [999999.99, 'L\'importo non può superare 999.999,99']
  },
  
  description: {
    type: String,
    required: [true, 'La descrizione è obbligatoria'],
    trim: true,
    maxlength: [200, 'La descrizione non può superare i 200 caratteri']
  },
  
  source: {
    type: String,
    required: [true, 'La fonte è obbligatoria'],
    enum: [
      'salary',      // Stipendio
      'freelance',   // Lavoro autonomo
      'bonus',       // Bonus
      'investment',  // Investimenti
      'rental',      // Affitti
      'gift',        // Regali
      'refund',      // Rimborsi
      'other'        // Altro
    ],
    default: 'other'
  },
  
  date: {
    type: Date,
    required: [true, 'La data è obbligatoria'],
    default: Date.now
  },
  
  userId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'L\'utente è obbligatorio']
  },
  
  familyId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Family',
    required: [true, 'La famiglia è obbligatoria']
  },
  
  // Ricorrenza
  isRecurring: {
    type: Boolean,
    default: false
  },
  
  recurringPattern: {
    frequency: {
      type: String,
      enum: ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'],
      default: 'monthly'
    },
    interval: {
      type: Number,
      default: 1,
      min: 1
    },
    dayOfMonth: {
      type: Number,
      min: 1,
      max: 31,
      default: null
    },
    endDate: {
      type: Date,
      default: null
    },
    nextOccurrence: {
      type: Date,
      default: null
    }
  },
  
  // Metadati
  tags: [{
    type: String,
    trim: true,
    maxlength: [20, 'Il tag non può superare i 20 caratteri']
  }],
  
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Le note non possono superare i 500 caratteri']
  },
  
  // Informazioni fiscali
  taxInfo: {
    isTaxable: {
      type: Boolean,
      default: true
    },
    taxCategory: {
      type: String,
      trim: true,
      maxlength: [50, 'La categoria fiscale non può superare i 50 caratteri']
    },
    withholdingTax: {
      type: Number,
      min: 0,
      default: 0
    }
  },
  
  isActive: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true
});

// Index per performance
incomeSchema.index({ familyId: 1, date: -1 });
incomeSchema.index({ userId: 1, date: -1 });
incomeSchema.index({ source: 1, date: -1 });
incomeSchema.index({ familyId: 1, source: 1, date: -1 });
incomeSchema.index({ isRecurring: 1, 'recurringPattern.nextOccurrence': 1 });

// Index per ricerche testuali
incomeSchema.index({
  description: 'text',
  notes: 'text'
});

// Virtual per il mese/anno
incomeSchema.virtual('monthYear').get(function() {
  const date = new Date(this.date);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
});

// Metodo per formattare l'importo
incomeSchema.methods.getFormattedAmount = function(currency = 'EUR') {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency
  }).format(this.amount);
};

// Metodo per calcolare l'importo netto (dopo tasse)
incomeSchema.methods.getNetAmount = function() {
  if (this.taxInfo && this.taxInfo.withholdingTax) {
    return this.amount - this.taxInfo.withholdingTax;
  }
  return this.amount;
};

// Metodo per calcolare la prossima occorrenza
incomeSchema.methods.calculateNextOccurrence = function() {
  if (!this.isRecurring) return null;
  
  const { frequency, interval, dayOfMonth } = this.recurringPattern;
  const currentDate = new Date(this.date);
  let nextDate = new Date(currentDate);
  
  switch (frequency) {
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + (7 * interval));
      break;
    case 'biweekly':
      nextDate.setDate(nextDate.getDate() + (14 * interval));
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + interval);
      if (dayOfMonth) {
        nextDate.setDate(dayOfMonth);
      }
      break;
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + (3 * interval));
      break;
    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + interval);
      break;
  }
  
  return nextDate;
};

// Metodi statici per statistiche
incomeSchema.statics.getMonthlyStats = async function(familyId, year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  
  const stats = await this.aggregate([
    {
      $match: {
        familyId: new mongoose.Types.ObjectId(familyId),
        date: { $gte: startDate, $lte: endDate },
        isActive: true
      }
    },
    {
      $group: {
        _id: '$source',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);
  
  return stats;
};

incomeSchema.statics.getYearlyStats = async function(familyId, year) {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31, 23, 59, 59);
  
  const stats = await this.aggregate([
    {
      $match: {
        familyId: new mongoose.Types.ObjectId(familyId),
        date: { $gte: startDate, $lte: endDate },
        isActive: true
      }
    },
    {
      $group: {
        _id: {
          month: { $month: '$date' },
          source: '$source'
        },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.month',
        totalAmount: { $sum: '$totalAmount' },
        sources: {
          $push: {
            source: '$_id.source',
            amount: '$totalAmount',
            count: '$count'
          }
        }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
  
  return stats;
};

incomeSchema.statics.getUserStats = async function(familyId, userId, startDate, endDate) {
  const stats = await this.aggregate([
    {
      $match: {
        familyId: new mongoose.Types.ObjectId(familyId),
        userId: new mongoose.Types.ObjectId(userId),
        date: { $gte: startDate, $lte: endDate },
        isActive: true
      }
    },
    {
      $group: {
        _id: '$source',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);
  
  return stats;
};

// Metodo statico per ottenere entrate ricorrenti da processare
incomeSchema.statics.getRecurringIncomesDue = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return await this.find({
    isRecurring: true,
    isActive: true,
    'recurringPattern.nextOccurrence': { $lte: today },
    $or: [
      { 'recurringPattern.endDate': null },
      { 'recurringPattern.endDate': { $gte: today } }
    ]
  }).populate('userId familyId');
};

// Middleware pre-save per calcolare prossima occorrenza
incomeSchema.pre('save', function(next) {
  if (this.isRecurring && this.isModified('recurringPattern')) {
    this.recurringPattern.nextOccurrence = this.calculateNextOccurrence();
  }
  next();
});

// Metodo per creare la prossima entrata ricorrente
incomeSchema.methods.createNextRecurrence = async function() {
  if (!this.isRecurring) return null;
  
  const nextDate = this.calculateNextOccurrence();
  if (!nextDate) return null;
  
  // Controlla se abbiamo superato la data di fine
  if (this.recurringPattern.endDate && nextDate > this.recurringPattern.endDate) {
    return null;
  }
  
  const nextIncome = new this.constructor({
    amount: this.amount,
    description: this.description,
    source: this.source,
    date: nextDate,
    userId: this.userId,
    familyId: this.familyId,
    isRecurring: this.isRecurring,
    recurringPattern: this.recurringPattern,
    tags: this.tags,
    notes: this.notes,
    taxInfo: this.taxInfo
  });
  
  // Aggiorna la prossima occorrenza
  this.recurringPattern.nextOccurrence = nextIncome.calculateNextOccurrence();
  await this.save();
  
  return await nextIncome.save();
};

module.exports = mongoose.model('Income', incomeSchema); 