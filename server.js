require('dotenv').config();

const app = require('./src/app');
const connectDB = require('./src/config/database');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 5050;

// Connessione al database con gestione errori migliorata
const startServer = async () => {
  try {
    await connectDB();
    
    // Avvio del server solo dopo connessione DB riuscita
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
      logger.info(`📊 Health check available at http://localhost:${PORT}/health`);
    });

    // Gestione graceful shutdown
    process.on('unhandledRejection', (err, promise) => {
      logger.error('Unhandled Promise Rejection:', err.message);
      server.close(() => {
        process.exit(1);
      });
    });

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception:', err.message);
      logger.error('Stack:', err.stack);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error.message);
    logger.error('Stack:', error.stack);
    process.exit(1);
  }
};

startServer(); 