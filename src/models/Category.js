const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Il nome della categoria è obbligatorio'],
    trim: true,
    maxlength: [30, 'Il nome non può superare i 30 caratteri']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [100, 'La descrizione non può superare i 100 caratteri']
  },
  
  color: {
    type: String,
    required: [true, 'Il colore è obbligatorio'],
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Inserisci un colore hex valido'],
    default: '#3B82F6'
  },
  
  icon: {
    type: String,
    required: [true, 'L\'icona è obbligatoria'],
    trim: true,
    default: 'shopping-cart'
  },
  
  familyId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Family',
    required: function() {
      return !this.isDefault;
    }
  },
  
  isDefault: {
    type: Boolean,
    default: false
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  order: {
    type: Number,
    default: 0
  },
  
  // Statistiche categoria
  totalExpenses: {
    type: Number,
    default: 0
  },
  
  lastUsed: {
    type: Date,
    default: null
  }

}, {
  timestamps: true
});

// Index per performance
categorySchema.index({ familyId: 1, isActive: 1 });
categorySchema.index({ isDefault: 1 });
categorySchema.index({ name: 1, familyId: 1 }, { unique: true });

// Metodo per aggiornare statistiche
categorySchema.methods.updateStats = async function() {
  const Expense = require('./Expense');
  
  const stats = await Expense.aggregate([
    {
      $match: {
        category: this._id,
        familyId: this.familyId
      }
    },
    {
      $group: {
        _id: null,
        totalExpenses: { $sum: '$amount' },
        lastUsed: { $max: '$date' }
      }
    }
  ]);
  
  if (stats.length > 0) {
    this.totalExpenses = stats[0].totalExpenses;
    this.lastUsed = stats[0].lastUsed;
  } else {
    this.totalExpenses = 0;
    this.lastUsed = null;
  }
  
  return this.save();
};

// Metodo statico per creare categorie predefinite
categorySchema.statics.createDefaultCategories = async function() {
  const defaultCategories = [
    {
      name: 'Alimentari',
      description: 'Spesa per cibo e bevande',
      color: '#10B981',
      icon: 'shopping-cart',
      isDefault: true,
      order: 1
    },
    {
      name: 'Trasporti',
      description: 'Benzina, mezzi pubblici, taxi',
      color: '#3B82F6',
      icon: 'car',
      isDefault: true,
      order: 2
    },
    {
      name: 'Casa',
      description: 'Affitto, bollette, manutenzione',
      color: '#8B5CF6',
      icon: 'home',
      isDefault: true,
      order: 3
    },
    {
      name: 'Salute',
      description: 'Medico, farmaci, visite',
      color: '#EF4444',
      icon: 'heart',
      isDefault: true,
      order: 4
    },
    {
      name: 'Intrattenimento',
      description: 'Cinema, ristoranti, svago',
      color: '#F59E0B',
      icon: 'film',
      isDefault: true,
      order: 5
    },
    {
      name: 'Abbigliamento',
      description: 'Vestiti, scarpe, accessori',
      color: '#EC4899',
      icon: 'shirt',
      isDefault: true,
      order: 6
    },
    {
      name: 'Educazione',
      description: 'Scuola, corsi, libri',
      color: '#06B6D4',
      icon: 'book',
      isDefault: true,
      order: 7
    },
    {
      name: 'Altro',
      description: 'Spese varie non categorizzate',
      color: '#6B7280',
      icon: 'more-horizontal',
      isDefault: true,
      order: 8
    }
  ];
  
  const existingDefaults = await this.find({ isDefault: true });
  
  if (existingDefaults.length === 0) {
    await this.insertMany(defaultCategories);
    console.log('Categorie predefinite create con successo');
  }
  
  return defaultCategories;
};

// Metodo statico per ottenere categorie per famiglia
categorySchema.statics.getCategoriesForFamily = async function(familyId) {
  // Ottieni categorie predefinite + categorie della famiglia
  const categories = await this.find({
    $or: [
      { isDefault: true },
      { familyId: familyId }
    ],
    isActive: true
  }).sort({ order: 1, name: 1 });
  
  return categories;
};

// Middleware pre-remove per controllare se la categoria è in uso
categorySchema.pre('deleteOne', { document: true, query: false }, async function() {
  const Expense = require('./Expense');
  
  const expenseCount = await Expense.countDocuments({ category: this._id });
  
  if (expenseCount > 0) {
    throw new Error('Impossibile eliminare la categoria: è utilizzata in alcune spese');
  }
});

module.exports = mongoose.model('Category', categorySchema); 