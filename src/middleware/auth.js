const User = require('../models/User');
const { verifyToken, extractTokenFromHeader } = require('../config/jwt');
const logger = require('../utils/logger');

// Middleware per verificare autenticazione
const authenticate = async (req, res, next) => {
  try {
    // Estrai token dall'header
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      return res.status(401).json({
        error: 'Accesso negato',
        message: 'Token di autenticazione richiesto'
      });
    }

    // Verifica token
    const decoded = verifyToken(token);
    
    // Trova utente
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Accesso negato',
        message: 'Utente non trovato o non attivo'
      });
    }

    // Aggiungi utente alla richiesta
    req.user = user;
    req.token = token;
    
    logger.debug(`User authenticated: ${user.email}`);
    next();

  } catch (error) {
    logger.error('Authentication error:', error.message);
    
    return res.status(401).json({
      error: 'Accesso negato',
      message: 'Token non valido o scaduto'
    });
  }
};

// Middleware per verificare ruolo admin famiglia
const requireFamilyAdmin = async (req, res, next) => {
  try {
    if (!req.user.familyId) {
      return res.status(403).json({
        error: 'Accesso negato',
        message: 'Utente non appartiene a nessuna famiglia'
      });
    }

    const Family = require('../models/Family');
    const family = await Family.findById(req.user.familyId);
    
    if (!family) {
      return res.status(404).json({
        error: 'Famiglia non trovata'
      });
    }

    const isAdmin = family.isUserAdmin(req.user._id);
    
    if (!isAdmin) {
      return res.status(403).json({
        error: 'Accesso negato',
        message: 'Privilegi di amministratore richiesti'
      });
    }

    req.family = family;
    next();

  } catch (error) {
    logger.error('Family admin check error:', error.message);
    
    return res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nella verifica dei privilegi'
    });
  }
};

// Middleware per verificare appartenenza alla famiglia
const requireFamilyMember = async (req, res, next) => {
  try {
    if (!req.user.familyId) {
      return res.status(403).json({
        error: 'Accesso negato',
        message: 'Utente non appartiene a nessuna famiglia'
      });
    }

    const Family = require('../models/Family');
    const family = await Family.findById(req.user.familyId);
    
    if (!family) {
      return res.status(404).json({
        error: 'Famiglia non trovata'
      });
    }

    const isMember = family.members.some(
      member => member.user.toString() === req.user._id.toString() && member.isActive
    );
    
    if (!isMember) {
      return res.status(403).json({
        error: 'Accesso negato',
        message: 'Utente non è membro di questa famiglia'
      });
    }

    req.family = family;
    next();

  } catch (error) {
    logger.error('Family member check error:', error.message);
    
    return res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nella verifica dell\'appartenenza alla famiglia'
    });
  }
};

// Middleware opzionale per autenticazione (non blocca se non autenticato)
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (token) {
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
        req.token = token;
      }
    }
    
    next();

  } catch (error) {
    // In caso di errore, continua senza autenticazione
    logger.debug('Optional auth failed:', error.message);
    next();
  }
};

module.exports = {
  authenticate,
  requireFamilyAdmin,
  requireFamilyMember,
  optionalAuth
}; 