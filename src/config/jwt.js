const jwt = require('jsonwebtoken');

// Genera un token JWT
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
    issuer: 'FamBud-API',
    audience: 'FamBud-Client'
  });
};

// Verifica un token JWT
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'FamBud-API',
      audience: 'FamBud-Client'
    });
  } catch (error) {
    throw new Error('Token non valido');
  }
};

// Genera token per reset password
const generateResetToken = (userId) => {
  return jwt.sign(
    { userId, type: 'reset' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

// Verifica token di reset password
const verifyResetToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'reset') {
      throw new Error('Tipo di token non valido');
    }
    return decoded;
  } catch (error) {
    throw new Error('Token di reset non valido o scaduto');
  }
};

// Genera token per invito famiglia
const generateInviteToken = (familyId, email) => {
  return jwt.sign(
    { familyId, email, type: 'invite' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Verifica token di invito
const verifyInviteToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'invite') {
      throw new Error('Tipo di token non valido');
    }
    return decoded;
  } catch (error) {
    throw new Error('Token di invito non valido o scaduto');
  }
};

// Estrae token dall'header Authorization
const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
};

module.exports = {
  generateToken,
  verifyToken,
  generateResetToken,
  verifyResetToken,
  generateInviteToken,
  verifyInviteToken,
  extractTokenFromHeader
}; 