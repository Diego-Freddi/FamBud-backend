const User = require('../models/User');
const Family = require('../models/Family');
const { generateToken } = require('../config/jwt');
const logger = require('../utils/logger');
const crypto = require('crypto');
const { sendEmail } = require('../services/emailService');

// @desc    Registrazione utente
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { name, email, password, familyName } = req.body;

    // Verifica se l'utente esiste già
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        error: 'Utente già esistente',
        message: 'Un utente con questa email è già registrato'
      });
    }

    // Crea nuovo utente
    const user = new User({
      name,
      email,
      password // Verrà hashata automaticamente dal middleware pre-save
    });

    await user.save();
    logger.info(`New user registered: ${email}`);

    // Se è specificato un nome famiglia, crea la famiglia
    let family = null;
    if (familyName && familyName.trim()) {
      family = new Family({
        name: familyName.trim(),
        createdBy: user._id,
        members: [{
          user: user._id,
          role: 'admin',
          joinedAt: new Date(),
          isActive: true
        }]
      });

      await family.save();
      
      // Aggiorna l'utente con l'ID della famiglia
      user.familyId = family._id;
      user.role = 'admin';
      await user.save();

      logger.info(`New family created: ${familyName} by ${email}`);
    }

    // Genera token JWT
    const token = generateToken({
      userId: user._id,
      email: user.email,
      familyId: user.familyId
    });

    // Risposta con dati utente (senza password)
    res.status(201).json({
      success: true,
      message: 'Registrazione completata con successo',
      data: {
        token,
        user: user.getPublicProfile(),
        family: family ? {
          _id: family._id,
          name: family.name,
          role: 'admin'
        } : null
      }
    });

  } catch (error) {
    logger.error('Registration error:', error);
    
    // Gestione errori di validazione Mongoose
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.join(', ')
      });
    }

    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante la registrazione'
    });
  }
};

// @desc    Login utente
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validazione input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Dati mancanti',
        message: 'Email e password sono obbligatorie'
      });
    }

    // Trova utente e verifica credenziali
    const user = await User.findByCredentials(email, password);
    
    // Carica informazioni famiglia se presente
    let family = null;
    if (user.familyId) {
      family = await Family.findById(user.familyId)
        .populate('members.user', 'name email avatar')
        .select('name description settings members');
    }

    // Genera token JWT
    const token = generateToken({
      userId: user._id,
      email: user.email,
      familyId: user.familyId
    });

    logger.info(`User logged in: ${email}`);

    res.json({
      success: true,
      message: 'Login effettuato con successo',
      data: {
        token,
        user: user.getPublicProfile(),
        family: family ? {
          _id: family._id,
          name: family.name,
          description: family.description,
          settings: family.settings,
          members: family.members,
          userRole: family.members.find(m => 
            m.user._id.toString() === user._id.toString()
          )?.role || 'member'
        } : null
      }
    });

  } catch (error) {
    logger.error('Login error:', error);

    if (error.message === 'Credenziali non valide') {
      return res.status(401).json({
        error: 'Credenziali non valide',
        message: 'Email o password non corretti'
      });
    }

    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante il login'
    });
  }
};

// @desc    Ottieni profilo utente corrente
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    // L'utente è già disponibile tramite il middleware di autenticazione
    const user = req.user;
    
    // Carica informazioni famiglia se presente
    let family = null;
    if (user.familyId) {
      family = await Family.findById(user.familyId)
        .populate('members.user', 'name email avatar')
        .select('name description settings members');
    }

    res.json({
      success: true,
      data: {
        user: user.getPublicProfile(),
        family: family ? {
          _id: family._id,
          name: family.name,
          description: family.description,
          settings: family.settings,
          members: family.members,
          userRole: family.members.find(m => 
            m.user._id.toString() === user._id.toString()
          )?.role || 'member'
        } : null
      }
    });

  } catch (error) {
    logger.error('Get profile error:', error);
    
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel recupero del profilo'
    });
  }
};

// @desc    Crea nuova famiglia
// @route   POST /api/auth/create-family
// @access  Private
const createFamily = async (req, res) => {
  try {
    const { name, description } = req.body;
    const user = req.user;

    // Verifica che l'utente non appartenga già a una famiglia
    if (user.familyId) {
      return res.status(400).json({
        error: 'Famiglia già esistente',
        message: 'Appartieni già a una famiglia'
      });
    }

    // Validazione nome famiglia
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Nome famiglia richiesto',
        message: 'Il nome della famiglia è obbligatorio'
      });
    }

    // Crea nuova famiglia
    const family = new Family({
      name: name.trim(),
      description: description?.trim() || '',
      createdBy: user._id,
      members: [{
        user: user._id,
        role: 'admin',
        joinedAt: new Date(),
        isActive: true
      }]
    });

    await family.save();

    // Aggiorna utente
    user.familyId = family._id;
    user.role = 'admin';
    await user.save();

    logger.info(`Family created: ${name} by ${user.email}`);

    res.status(201).json({
      success: true,
      message: 'Famiglia creata con successo',
      data: {
        user: user.getPublicProfile(),
        family: {
          _id: family._id,
          name: family.name,
          description: family.description,
          settings: family.settings,
          members: [{
            user: {
              _id: user._id,
              name: user.name,
              email: user.email,
              avatar: user.avatar
            },
            role: 'admin',
            joinedAt: new Date(),
            isActive: true
          }],
          userRole: 'admin'
        }
      }
    });

  } catch (error) {
    logger.error('Create family error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.join(', ')
      });
    }

    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante la creazione della famiglia'
    });
  }
};

// @desc    Richiesta reset password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email richiesta',
        message: 'L\'email è obbligatoria'
      });
    }

    // Trova l'utente
    const user = await User.findOne({ email });
    if (!user) {
      // Per sicurezza, non rivelare se l'email esiste o meno
      return res.json({
        success: true,
        message: 'Se l\'email esiste, riceverai le istruzioni per il reset'
      });
    }

    // Genera token di reset
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 10 * 60 * 1000; // 10 minuti

    // Salva token nel database
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = resetTokenExpiry;
    await user.save();

    // URL di reset (in produzione sarà il frontend)
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

    // Invio email con SendGrid
    if (process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM) {
      try {
        await sendEmail({
          to: user.email,
          subject: 'Reset Password - FamilyBudget',
          html: `
            <h2>Reset Password</h2>
            <p>Ciao ${user.name},</p>
            <p>Hai richiesto il reset della password per il tuo account FamilyBudget.</p>
            <p>Clicca sul link seguente per reimpostare la password:</p>
            <a href="${resetUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
            <p>Il link scadrà tra 10 minuti.</p>
            <p>Se non hai richiesto questo reset, ignora questa email.</p>
            <br>
            <p>Team FamilyBudget</p>
          `
        });
        
        logger.info(`Password reset email sent to: ${email}`);
      } catch (emailError) {
        logger.error('Email sending error:', emailError);
        // Non bloccare il processo se l'email fallisce
      }
    } else {
      // In sviluppo, logga il link di reset se l'email non è configurata
      if (process.env.NODE_ENV === 'development') {
        logger.warn(`Email not configured. Reset link for ${email}: ${resetUrl}`);
        console.log(`\n🔗 RESET PASSWORD LINK for ${email}:`);
        console.log(`${resetUrl}\n`);
      }
    }

    res.json({
      success: true,
      message: 'Se l\'email esiste, riceverai le istruzioni per il reset',
      // In sviluppo, restituisci il token per testing
      ...(process.env.NODE_ENV === 'development' && { resetToken })
    });

  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante la richiesta di reset'
    });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        error: 'Password richiesta',
        message: 'La nuova password è obbligatoria'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password troppo corta',
        message: 'La password deve essere di almeno 6 caratteri'
      });
    }

    // Hash del token per confronto
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Trova utente con token valido e non scaduto
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        error: 'Token non valido',
        message: 'Token di reset non valido o scaduto'
      });
    }

    // Aggiorna password
    user.password = password; // Verrà hashata dal middleware pre-save
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    logger.info(`Password reset successful for: ${user.email}`);

    // Genera nuovo token JWT
    const jwtToken = generateToken({
      userId: user._id,
      email: user.email,
      familyId: user.familyId
    });

    res.json({
      success: true,
      message: 'Password reimpostata con successo',
      data: {
        token: jwtToken,
        user: user.getPublicProfile()
      }
    });

  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante il reset della password'
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
  createFamily,
  forgotPassword,
  resetPassword
}; 