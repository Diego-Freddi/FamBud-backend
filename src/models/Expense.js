const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
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
  
  category: {
    type: mongoose.Schema.ObjectId,
    ref: 'Category',
    required: [true, 'La categoria è obbligatoria']
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
  
  // Informazioni scontrino/ricevuta
  receipt: {
    imageUrl: {
      type: String,
      default: null
    },
    ocrData: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    merchant: {
      type: String,
      trim: true,
      maxlength: [100, 'Il nome del negozio non può superare i 100 caratteri']
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
  
  // Geolocalizzazione (opzionale)
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: undefined
    },
    address: {
      type: String,
      trim: true,
      maxlength: [200, 'L\'indirizzo non può superare i 200 caratteri']
    }
  },
  
  // Stato della spesa
  isRecurring: {
    type: Boolean,
    default: false
  },
  
  recurringPattern: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly'],
      default: 'monthly'
    },
    interval: {
      type: Number,
      default: 1,
      min: 1
    },
    endDate: {
      type: Date,
      default: null
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
expenseSchema.index({ familyId: 1, date: -1 });
expenseSchema.index({ userId: 1, date: -1 });
expenseSchema.index({ category: 1, date: -1 });
expenseSchema.index({ familyId: 1, category: 1, date: -1 });
expenseSchema.index({ 'location.coordinates': '2dsphere' });

// Index per ricerche testuali
expenseSchema.index({
  description: 'text',
  notes: 'text',
  'receipt.merchant': 'text'
});

// Virtual per il mese/anno
expenseSchema.virtual('monthYear').get(function() {
  const date = new Date(this.date);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
});

// Metodo per formattare l'importo
expenseSchema.methods.getFormattedAmount = function(currency = 'EUR') {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency
  }).format(this.amount);
};

// Metodo per ottenere il periodo della spesa
expenseSchema.methods.getPeriod = function() {
  const date = new Date(this.date);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    weekday: date.getDay()
  };
};

// Metodi statici per statistiche
expenseSchema.statics.getMonthlyStats = async function(familyId, year, month) {
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
        _id: '$category',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    },
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'categoryInfo'
      }
    },
    {
      $unwind: '$categoryInfo'
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);
  
  return stats;
};

expenseSchema.statics.getYearlyStats = async function(familyId, year) {
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
          category: '$category'
        },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.month',
        totalAmount: { $sum: '$totalAmount' },
        categories: {
          $push: {
            category: '$_id.category',
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

expenseSchema.statics.getUserStats = async function(familyId, userId, startDate, endDate) {
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
        _id: '$category',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'categoryInfo'
      }
    },
    {
      $unwind: '$categoryInfo'
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);
  
  return stats;
};

// Middleware post-save per aggiornare statistiche categoria
expenseSchema.post('save', async function() {
  const Category = require('./Category');
  const category = await Category.findById(this.category);
  if (category) {
    await category.updateStats();
  }
});

// Middleware post-remove per aggiornare statistiche categoria
expenseSchema.post('deleteOne', { document: true, query: false }, async function() {
  const Category = require('./Category');
  const category = await Category.findById(this.category);
  if (category) {
    await category.updateStats();
  }
});

module.exports = mongoose.model('Expense', expenseSchema); 