const User = require('../models/User');
const Family = require('../models/Family');
const Expense = require('../models/Expense');
const Income = require('../models/Income');
const Budget = require('../models/Budget');
const { generateToken } = require('../config/jwt');
const { validationResult } = require('express-validator');
const { deleteImage, extractPublicId } = require('../config/cloudinary');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

// @desc    Cambia password utente
// @route   PUT /api/profile/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    // Controlla errori di validazione
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.array().map(err => err.msg).join(', ')
      });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id;

    // Trova utente con password
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        error: 'Utente non trovato',
        message: 'L\'utente non esiste'
      });
    }

    // Verifica password attuale
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        error: 'Password non valida',
        message: 'La password attuale non è corretta'
      });
    }

    // Verifica che la nuova password sia diversa
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        error: 'Password identica',
        message: 'La nuova password deve essere diversa da quella attuale'
      });
    }

    // Aggiorna password (il middleware pre-save si occuperà dell'hash)
    user.password = newPassword;
    await user.save();

    logger.info(`Password changed for user: ${user.email}`);

    res.json({
      success: true,
      message: 'Password cambiata con successo'
    });

  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante il cambio password'
    });
  }
};

// @desc    Cambia email utente
// @route   PUT /api/profile/change-email
// @access  Private
const changeEmail = async (req, res) => {
  try {
    // Controlla errori di validazione
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.array().map(err => err.msg).join(', ')
      });
    }

    const { email } = req.body;
    const userId = req.user._id;

    // Verifica che l'email non sia già in uso
    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
      return res.status(400).json({
        error: 'Email già in uso',
        message: 'Questa email è già utilizzata da un altro utente'
      });
    }

    // Aggiorna email
    const user = await User.findByIdAndUpdate(
      userId,
      { email },
      { new: true, runValidators: true }
    );

    logger.info(`Email changed for user: ${user._id} to ${email}`);

    res.json({
      success: true,
      message: 'Email aggiornata con successo',
      data: {
        user: user.getPublicProfile()
      }
    });

  } catch (error) {
    logger.error('Change email error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.join(', ')
      });
    }

    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'aggiornamento email'
    });
  }
};

// @desc    Upload avatar utente
// @route   POST /api/profile/upload-avatar
// @access  Private
const uploadAvatar = async (req, res) => {
  try {
    const userId = req.user._id;

    // Verifica che sia stato caricato un file
    if (!req.file) {
      return res.status(400).json({
        error: 'File mancante',
        message: 'Nessun file avatar caricato'
      });
    }

    // Cloudinary ha già gestito l'upload e le validazioni tramite multer
    const avatarUrl = req.file.path; // URL dell'immagine su Cloudinary
    const publicId = req.file.filename; // Public ID per future eliminazioni

    // Trova utente e rimuovi avatar precedente se esiste
    const user = await User.findById(userId);
    if (user.avatar) {
      const oldPublicId = extractPublicId(user.avatar);
      if (oldPublicId) {
        try {
          await deleteImage(oldPublicId);
          logger.info(`Old avatar deleted from Cloudinary: ${oldPublicId}`);
        } catch (err) {
          logger.warn(`Could not delete old avatar from Cloudinary: ${oldPublicId}`, err);
        }
      }
    }

    // Aggiorna utente con nuovo avatar
    user.avatar = avatarUrl;
    await user.save();

    logger.info(`Avatar uploaded to Cloudinary for user: ${user.email}`);

    res.json({
      success: true,
      message: 'Avatar caricato con successo',
      data: {
        avatarUrl: avatarUrl,
        user: user.getPublicProfile()
      }
    });

  } catch (error) {
    logger.error('Upload avatar error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante il caricamento avatar'
    });
  }
};

// @desc    Imposta avatar tramite URL
// @route   PUT /api/profile/set-avatar-url
// @access  Private
const setAvatarUrl = async (req, res) => {
  try {
    // Controlla errori di validazione
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.array().map(err => err.msg).join(', ')
      });
    }

    const { avatarUrl } = req.body;
    const userId = req.user._id;

    // Trova utente e rimuovi avatar precedente se esiste (solo se era su Cloudinary)
    const user = await User.findById(userId);
    if (user.avatar && user.avatar.includes('cloudinary.com')) {
      const oldPublicId = extractPublicId(user.avatar);
      if (oldPublicId) {
        try {
          await deleteImage(oldPublicId);
          logger.info(`Old avatar deleted from Cloudinary: ${oldPublicId}`);
        } catch (err) {
          logger.warn(`Could not delete old avatar from Cloudinary: ${oldPublicId}`, err);
        }
      }
    }

    // Aggiorna utente con nuovo avatar URL
    user.avatar = avatarUrl;
    await user.save();

    logger.info(`Avatar URL set for user: ${user.email} - ${avatarUrl}`);

    res.json({
      success: true,
      message: 'Avatar aggiornato con successo',
      data: {
        avatarUrl: avatarUrl,
        user: user.getPublicProfile()
      }
    });

  } catch (error) {
    logger.error('Set avatar URL error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'aggiornamento avatar'
    });
  }
};

// @desc    Esporta dati utente
// @route   GET /api/profile/export-data
// @access  Private
const exportUserData = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = req.user;

    // Raccogli tutti i dati dell'utente
    const [expenses, incomes, budgets, family] = await Promise.all([
      Expense.find({ userId }).populate('categoryId', 'name color'),
      Income.find({ userId }),
      Budget.find({ familyId: user.familyId }),
      user.familyId ? Family.findById(user.familyId).populate('members.user', 'name email') : null
    ]);

    // Prepara dati per export
    const exportData = {
      user: {
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      },
      family: family ? {
        name: family.name,
        description: family.description,
        role: user.role,
        joinedAt: family.members.find(m => m.user._id.toString() === userId.toString())?.joinedAt
      } : null,
      expenses: expenses.map(expense => ({
        amount: expense.amount,
        description: expense.description,
        category: expense.categoryId?.name,
        date: expense.date,
        notes: expense.notes,
        tags: expense.tags,
        createdAt: expense.createdAt
      })),
      incomes: incomes.map(income => ({
        amount: income.amount,
        description: income.description,
        source: income.source,
        date: income.date,
        isRecurring: income.isRecurring,
        recurringType: income.recurringType,
        notes: income.notes,
        createdAt: income.createdAt
      })),
      statistics: {
        totalExpenses: expenses.reduce((sum, exp) => sum + exp.amount, 0),
        totalIncomes: incomes.reduce((sum, inc) => sum + inc.amount, 0),
        expensesCount: expenses.length,
        incomesCount: incomes.length
      },
      exportDate: new Date().toISOString()
    };

    logger.info(`Data exported for user: ${user.email}`);

    res.json({
      success: true,
      message: 'Dati esportati con successo',
      data: exportData
    });

  } catch (error) {
    logger.error('Export data error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'esportazione dati'
    });
  }
};

// @desc    Elimina account utente
// @route   DELETE /api/profile/delete-account
// @access  Private
const deleteAccount = async (req, res) => {
  try {
    // Controlla errori di validazione
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.array().map(err => err.msg).join(', ')
      });
    }

    const { password } = req.body;
    const userId = req.user._id;

    // Verifica che la password sia stata fornita
    if (!password) {
      return res.status(400).json({
        error: 'Password richiesta',
        message: 'Inserisci la tua password per confermare l\'eliminazione dell\'account'
      });
    }

    // Trova utente con password per verificarla
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        error: 'Utente non trovato',
        message: 'L\'utente non esiste'
      });
    }

    // Verifica password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        error: 'Password non valida',
        message: 'La password inserita non è corretta'
      });
    }

    // Carica dati famiglia se presente
    let family = null;
    if (user.familyId) {
      family = await Family.findById(user.familyId);
    }

    // CASO 1: Utente è l'unico membro (e quindi amministratore)
    // --> viene eliminato dal database sia l'utente che la famiglia
    if (family && family.members.length === 1) {
      // Elimina avatar se esiste
      if (user.avatar && user.avatar.includes('cloudinary.com')) {
        const publicId = extractPublicId(user.avatar);
        if (publicId) {
          try {
            await deleteImage(publicId);
            logger.info(`Avatar deleted from Cloudinary: ${publicId}`);
          } catch (err) {
            logger.warn(`Could not delete avatar from Cloudinary: ${publicId}`, err);
          }
        }
      }

      // Elimina tutti i dati dell'utente e della famiglia
      await Promise.all([
        Expense.deleteMany({ familyId: user.familyId }),
        Income.deleteMany({ familyId: user.familyId }),
        Budget.deleteMany({ familyId: user.familyId }),
        Family.findByIdAndDelete(user.familyId),
        User.findByIdAndDelete(userId)
      ]);

      logger.info(`Account and family deleted for sole member: ${user.email}`);

      return res.json({
        success: true,
        message: 'Account e famiglia eliminati con successo'
      });
    }

    // CASO 2: Utente non è l'unico membro e non è amministratore
    // --> viene eliminato dalla famiglia e dal database
    if (family && family.members.length > 1 && user.role !== 'admin') {
      // Elimina avatar se esiste
      if (user.avatar && user.avatar.includes('cloudinary.com')) {
        const publicId = extractPublicId(user.avatar);
        if (publicId) {
          try {
            await deleteImage(publicId);
            logger.info(`Avatar deleted from Cloudinary: ${publicId}`);
          } catch (err) {
            logger.warn(`Could not delete avatar from Cloudinary: ${publicId}`, err);
          }
        }
      }

      // Rimuovi utente dalla famiglia
      await Family.findByIdAndUpdate(
        user.familyId,
        {
          $pull: { 
            members: { user: userId }
          }
        }
      );

      // Elimina tutti i dati dell'utente
      await Promise.all([
        Expense.deleteMany({ userId }),
        Income.deleteMany({ userId }),
        User.findByIdAndDelete(userId)
      ]);

      logger.info(`Member account deleted: ${user.email}`);

      return res.json({
        success: true,
        message: 'Account eliminato con successo'
      });
    }

    // CASO 3: Utente non è l'unico membro ma è l'amministratore
    // --> i suoi privilegi passano automaticamente al membro successivo e lui viene eliminato
    if (family && family.members.length > 1 && user.role === 'admin') {
      // Trova il primo membro che non è l'utente corrente
      const nextMember = family.members.find(member => 
        member.user.toString() !== userId.toString()
      );

      if (!nextMember) {
        return res.status(400).json({
          error: 'Errore nella gestione famiglia',
          message: 'Impossibile trovare un membro a cui trasferire i privilegi di amministratore'
        });
      }

      // Promuovi il prossimo membro ad admin
      await Family.findOneAndUpdate(
        { _id: user.familyId, 'members.user': nextMember.user },
        { $set: { 'members.$.role': 'admin' } }
      );

      // Elimina avatar se esiste
      if (user.avatar && user.avatar.includes('cloudinary.com')) {
        const publicId = extractPublicId(user.avatar);
        if (publicId) {
          try {
            await deleteImage(publicId);
            logger.info(`Avatar deleted from Cloudinary: ${publicId}`);
          } catch (err) {
            logger.warn(`Could not delete avatar from Cloudinary: ${publicId}`, err);
          }
        }
      }

      // Rimuovi utente dalla famiglia
      await Family.findByIdAndUpdate(
        user.familyId,
        {
          $pull: { 
            members: { user: userId }
          }
        }
      );

      // Elimina tutti i dati dell'utente
      await Promise.all([
        Expense.deleteMany({ userId }),
        Income.deleteMany({ userId }),
        User.findByIdAndDelete(userId)
      ]);

      // Carica il nuovo admin per il log
      const newAdmin = await User.findById(nextMember.user);
      logger.info(`Admin account deleted: ${user.email}, privileges transferred to: ${newAdmin?.email}`);

      return res.json({
        success: true,
        message: 'Account eliminato con successo. I privilegi di amministratore sono stati trasferiti automaticamente.'
      });
    }

    // Caso fallback (non dovrebbe mai accadere)
    return res.status(400).json({
      error: 'Errore nella gestione eliminazione',
      message: 'Impossibile determinare la strategia di eliminazione per questo account'
    });

  } catch (error) {
    logger.error('Delete account error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'eliminazione account'
    });
  }
};

module.exports = {
  changePassword,
  changeEmail,
  uploadAvatar,
  setAvatarUrl,
  exportUserData,
  deleteAccount
}; 