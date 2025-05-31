const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Il nome è obbligatorio'],
    trim: true,
    maxlength: [50, 'Il nome non può superare i 50 caratteri']
  },
  
  email: {
    type: String,
    required: [true, 'L\'email è obbligatoria'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Inserisci un\'email valida'
    ]
  },
  
  password: {
    type: String,
    required: [true, 'La password è obbligatoria'],
    minlength: [6, 'La password deve essere di almeno 6 caratteri'],
    select: false // Non include la password nelle query di default
  },
  
  familyId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Family',
    default: null
  },
  
  role: {
    type: String,
    enum: ['admin', 'member'],
    default: 'member'
  },
  
  avatar: {
    type: String,
    default: null
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  lastLogin: {
    type: Date,
    default: null
  },
  
  resetPasswordToken: String,
  resetPasswordExpires: Date

}, {
  timestamps: true // Aggiunge automaticamente createdAt e updatedAt
});

// Index per performance - rimuovo email perché già unique nel campo
userSchema.index({ familyId: 1 });

// Middleware pre-save per hash della password
userSchema.pre('save', async function(next) {
  // Solo se la password è stata modificata
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    // Hash della password
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Metodo per confrontare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Metodo per ottenere dati pubblici utente
userSchema.methods.getPublicProfile = function() {
  return {
    _id: this._id,
    name: this.name,
    email: this.email,
    familyId: this.familyId,
    role: this.role,
    avatar: this.avatar,
    isActive: this.isActive,
    lastLogin: this.lastLogin,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// Metodo statico per trovare utente per login
userSchema.statics.findByCredentials = async function(email, password) {
  const user = await this.findOne({ email, isActive: true }).select('+password');
  
  if (!user) {
    throw new Error('Credenziali non valide');
  }
  
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new Error('Credenziali non valide');
  }
  
  // Aggiorna ultimo login
  user.lastLogin = new Date();
  await user.save();
  
  return user;
};

module.exports = mongoose.model('User', userSchema); 