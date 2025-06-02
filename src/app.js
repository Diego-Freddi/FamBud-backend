const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');

// Importazione routes
const authRoutes = require('./routes/auth');
const expenseRoutes = require('./routes/expenses');
const incomeRoutes = require('./routes/incomes');
const categoryRoutes = require('./routes/categories');
const budgetRoutes = require('./routes/budgets');
const familyRoutes = require('./routes/family');
const dashboardRoutes = require('./routes/dashboard');
const profileRoutes = require('./routes/profile');

// Importazione middleware personalizzati
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Trust proxy per deployment su Render/Railway
app.set('trust proxy', 1);

// Middleware di sicurezza
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'https://family-finance-frontend.vercel.app', // Fallback specifico
  'https://family-finance.vercel.app' // Altro possibile nome
].filter(Boolean); // Rimuove valori undefined/null

logger.info('🌐 CORS Origins allowed:', { allowedOrigins });
logger.info('🔧 FRONTEND_URL from env:', { frontendUrl: process.env.FRONTEND_URL });

app.use(cors({
  origin: function (origin, callback) {
    // Permetti richieste senza origin (es. mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    // Controlla se l'origin è nella lista permessa
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // In sviluppo, permetti tutto
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    logger.warn('❌ CORS blocked origin:', { origin });
    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minuti
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // max 100 richieste per IP
  message: {
    error: 'Troppe richieste da questo IP, riprova più tardi.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  logger.http(`${req.method} ${req.originalUrl} - ${req.ip}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Family Finance Backend API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/incomes', incomeRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/profile', profileRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint non trovato',
    message: `La route ${req.originalUrl} non esiste`
  });
});

// Error handling middleware
app.use(errorHandler);

module.exports = app; 