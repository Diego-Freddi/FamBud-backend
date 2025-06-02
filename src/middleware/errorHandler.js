const logger = require('../utils/logger');

/**
 * Middleware per la gestione centralizzata degli errori
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log dell'errore
  logger.error(`Error ${err.message}`, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    stack: err.stack,
    body: req.body,
    params: req.params,
    query: req.query
  });

  // Errori di validazione Mongoose
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = {
      statusCode: 400,
      message: `Errore di validazione: ${message}`
    };
  }

  // Errore di duplicazione Mongoose (E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    error = {
      statusCode: 400,
      message: `${field} '${value}' è già in uso`
    };
  }

  // Errore di cast Mongoose (ObjectId non valido)
  if (err.name === 'CastError') {
    error = {
      statusCode: 400,
      message: 'Risorsa non trovata - ID non valido'
    };
  }

  // Errore JWT
  if (err.name === 'JsonWebTokenError') {
    error = {
      statusCode: 401,
      message: 'Token non valido'
    };
  }

  // Errore JWT scaduto
  if (err.name === 'TokenExpiredError') {
    error = {
      statusCode: 401,
      message: 'Token scaduto'
    };
  }

  // Errore di autorizzazione
  if (err.message === 'Accesso negato') {
    error = {
      statusCode: 403,
      message: 'Accesso negato - Permessi insufficienti'
    };
  }

  // Errore di rate limiting
  if (err.message && err.message.includes('Too many requests')) {
    error = {
      statusCode: 429,
      message: 'Troppe richieste - Riprova più tardi'
    };
  }

  // Risposta di errore
  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Errore interno del server',
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: {
        name: err.name,
        code: err.code,
        originalMessage: err.message
      }
    })
  });
};

module.exports = errorHandler; 