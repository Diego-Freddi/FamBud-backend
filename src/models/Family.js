const mongoose = require('mongoose');

const familySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Il nome della famiglia è obbligatorio'],
    trim: true,
    maxlength: [50, 'Il nome non può superare i 50 caratteri']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'La descrizione non può superare i 200 caratteri']
  },
  
  banner: {
    type: String,
    trim: true
  },
  
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  
  members: [{
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  invitations: [{
    email: {
      type: String,
      required: true,
      lowercase: true
    },
    token: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member'
    },
    invitedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'cancelled', 'expired'],
      default: 'pending'
    },
    acceptedAt: {
      type: Date
    },
    cancelledAt: {
      type: Date
    },
    cancelledBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  settings: {
    currency: {
      type: String,
      default: 'EUR',
      enum: ['EUR', 'USD', 'GBP', 'CHF']
    },
    budgetNotifications: {
      type: Boolean,
      default: true
    },
    monthlyReports: {
      type: Boolean,
      default: true
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
familySchema.index({ createdBy: 1 });
familySchema.index({ 'members.user': 1 });
familySchema.index({ 'invitations.email': 1 });
familySchema.index({ 'invitations.token': 1 });

// Metodo per aggiungere un membro
familySchema.methods.addMember = function(userId, role = 'member') {
  // Controlla se l'utente è già membro
  const existingMember = this.members.find(
    member => member.user.toString() === userId.toString()
  );
  
  if (existingMember) {
    throw new Error('L\'utente è già membro di questa famiglia');
  }
  
  this.members.push({
    user: userId,
    role: role,
    joinedAt: new Date(),
    isActive: true
  });
  
  return this.save();
};

// Metodo per rimuovere un membro
familySchema.methods.removeMember = function(userId) {
  this.members = this.members.filter(
    member => member.user.toString() !== userId.toString()
  );
  
  return this.save();
};

// Metodo per aggiornare ruolo membro
familySchema.methods.updateMemberRole = function(userId, newRole) {
  const member = this.members.find(
    member => member.user.toString() === userId.toString()
  );
  
  if (!member) {
    throw new Error('Membro non trovato');
  }
  
  member.role = newRole;
  return this.save();
};

// Metodo per creare invito
familySchema.methods.createInvitation = function(email, invitedBy, role = 'member') {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 giorni
  
  // Rimuovi inviti precedenti per la stessa email
  this.invitations = this.invitations.filter(inv => inv.email !== email);
  
  this.invitations.push({
    email,
    token,
    role,
    invitedBy,
    expiresAt,
    isUsed: false
  });
  
  return this.save().then(() => token);
};

// Metodo per verificare se un utente è admin
familySchema.methods.isUserAdmin = function(userId) {
  const member = this.members.find(
    member => member.user.toString() === userId.toString() && member.isActive
  );
  
  return member && member.role === 'admin';
};

// Metodo per ottenere membri attivi
familySchema.methods.getActiveMembers = function() {
  return this.members.filter(member => member.isActive);
};

// Metodo per ottenere statistiche famiglia
familySchema.methods.getStats = async function() {
  const Expense = require('./Expense');
  const Income = require('./Income');
  const Budget = require('./Budget');
  
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  
  try {
    // Statistiche spese correnti
    const expenseStats = await Expense.aggregate([
      { 
        $match: { 
          familyId: this._id,
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
          totalExpenses: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Statistiche entrate correnti
    const incomeStats = await Income.aggregate([
      { 
        $match: { 
          familyId: this._id,
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
          totalIncomes: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Statistiche budget correnti
    const budgetStats = await Budget.aggregate([
      { 
        $match: { 
          familyId: this._id,
          month: currentMonth,
          year: currentYear
        }
      },
      {
        $group: {
          _id: null,
          totalBudget: { $sum: '$amount' },
          totalSpent: { $sum: '$spent' },
          count: { $sum: 1 }
        }
      }
    ]);

    const expenses = expenseStats[0] || { totalExpenses: 0, count: 0 };
    const incomes = incomeStats[0] || { totalIncomes: 0, count: 0 };
    const budgets = budgetStats[0] || { totalBudget: 0, totalSpent: 0, count: 0 };

    return {
      currentMonth: {
        expenses: expenses.totalExpenses,
        incomes: incomes.totalIncomes,
        balance: incomes.totalIncomes - expenses.totalExpenses,
        expenseCount: expenses.count,
        incomeCount: incomes.count
      },
      budget: {
        total: budgets.totalBudget,
        spent: budgets.totalSpent,
        remaining: budgets.totalBudget - budgets.totalSpent,
        percentage: budgets.totalBudget > 0 ? 
          Math.round((budgets.totalSpent / budgets.totalBudget) * 100) : 0,
        budgetCount: budgets.count
      },
      members: {
        total: this.members.filter(m => m.isActive).length,
        admins: this.members.filter(m => m.isActive && m.role === 'admin').length
      }
    };
  } catch (error) {
    console.error('Error calculating family stats:', error);
    return {
      currentMonth: { expenses: 0, incomes: 0, balance: 0, expenseCount: 0, incomeCount: 0 },
      budget: { total: 0, spent: 0, remaining: 0, percentage: 0, budgetCount: 0 },
      members: { total: this.members.filter(m => m.isActive).length, admins: 0 }
    };
  }
};

module.exports = mongoose.model('Family', familySchema); 