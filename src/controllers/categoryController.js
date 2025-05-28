const Category = require('../models/Category');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

// @desc    Ottieni tutte le categorie della famiglia
// @route   GET /api/categories
// @access  Private
const getCategories = async (req, res) => {
  try {
    const { familyId } = req.user;

    // Ottieni categorie predefinite + categorie della famiglia
    const categories = await Category.getCategoriesForFamily(familyId);

    res.json({
      success: true,
      data: { categories }
    });

  } catch (error) {
    logger.error('Get categories error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel recupero delle categorie'
    });
  }
};

// @desc    Ottieni singola categoria
// @route   GET /api/categories/:id
// @access  Private
const getCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId } = req.user;

    const category = await Category.findOne({
      _id: id,
      $or: [
        { isDefault: true },
        { familyId: familyId }
      ],
      isActive: true
    });

    if (!category) {
      return res.status(404).json({
        error: 'Categoria non trovata',
        message: 'La categoria richiesta non esiste o non hai i permessi per visualizzarla'
      });
    }

    res.json({
      success: true,
      data: { category }
    });

  } catch (error) {
    logger.error('Get category error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel recupero della categoria'
    });
  }
};

// @desc    Crea nuova categoria
// @route   POST /api/categories
// @access  Private
const createCategory = async (req, res) => {
  try {
    // Validazione input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.array().map(err => err.msg).join(', ')
      });
    }

    const { familyId } = req.user;
    const { name, description, color, icon, order } = req.body;

    // Verifica che il nome non esista già per questa famiglia
    const existingCategory = await Category.findOne({
      name: name.trim(),
      $or: [
        { isDefault: true },
        { familyId: familyId }
      ],
      isActive: true
    });

    if (existingCategory) {
      return res.status(400).json({
        error: 'Categoria già esistente',
        message: 'Una categoria con questo nome esiste già'
      });
    }

    // Crea nuova categoria
    const category = new Category({
      name: name.trim(),
      description: description?.trim() || '',
      color: color || '#3B82F6',
      icon: icon || 'tag',
      familyId,
      order: order || 0,
      isDefault: false
    });

    await category.save();

    logger.info(`New category created: ${name} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Categoria creata con successo',
      data: { category }
    });

  } catch (error) {
    logger.error('Create category error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.join(', ')
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        error: 'Categoria già esistente',
        message: 'Una categoria con questo nome esiste già per questa famiglia'
      });
    }

    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante la creazione della categoria'
    });
  }
};

// @desc    Aggiorna categoria
// @route   PUT /api/categories/:id
// @access  Private
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId } = req.user;

    // Trova la categoria (incluse quelle default)
    const category = await Category.findOne({
      _id: id,
      $or: [
        { isDefault: true },
        { familyId: familyId }
      ],
      isActive: true
    });

    if (!category) {
      return res.status(404).json({
        error: 'Categoria non trovata',
        message: 'La categoria richiesta non esiste'
      });
    }

    // Solo admin famiglia può modificare categorie
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono modificare le categorie'
      });
    }

    const { name, description, color, icon, order } = req.body;

    // Per categorie default, permetti solo modifica colore e icona
    if (category.isDefault) {
      if (name !== undefined || description !== undefined || order !== undefined) {
        return res.status(400).json({
          error: 'Modifica non consentita',
          message: 'Per le categorie predefinite è possibile modificare solo colore e icona'
        });
      }
      
      // Aggiorna solo colore e icona per categorie default
      if (color !== undefined) category.color = color;
      if (icon !== undefined) category.icon = icon;
    } else {
      // Per categorie personalizzate, permetti tutte le modifiche
      
      // Se il nome è cambiato, verifica che non esista già
      if (name && name.trim() !== category.name) {
        const existingCategory = await Category.findOne({
          name: name.trim(),
          $or: [
            { isDefault: true },
            { familyId: familyId }
          ],
          isActive: true,
          _id: { $ne: id }
        });

        if (existingCategory) {
          return res.status(400).json({
            error: 'Categoria già esistente',
            message: 'Una categoria con questo nome esiste già'
          });
        }
      }

      // Aggiorna tutti i campi per categorie personalizzate
      if (name !== undefined) category.name = name.trim();
      if (description !== undefined) category.description = description.trim();
      if (color !== undefined) category.color = color;
      if (icon !== undefined) category.icon = icon;
      if (order !== undefined) category.order = order;
    }

    await category.save();

    logger.info(`Category updated: ${id} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Categoria aggiornata con successo',
      data: { category }
    });

  } catch (error) {
    logger.error('Update category error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.join(', ')
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        error: 'Categoria già esistente',
        message: 'Una categoria con questo nome esiste già per questa famiglia'
      });
    }

    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'aggiornamento della categoria'
    });
  }
};

// @desc    Elimina categoria
// @route   DELETE /api/categories/:id
// @access  Private
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId } = req.user;

    // Trova la categoria
    const category = await Category.findOne({
      _id: id,
      familyId: familyId, // Solo categorie della famiglia, non quelle predefinite
      isActive: true
    });

    if (!category) {
      return res.status(404).json({
        error: 'Categoria non trovata',
        message: 'La categoria richiesta non esiste o non può essere eliminata'
      });
    }

    // Solo admin famiglia può eliminare categorie
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono eliminare le categorie'
      });
    }

    // Il middleware pre-remove controllerà se la categoria è in uso
    try {
      await category.deleteOne();
    } catch (error) {
      if (error.message.includes('utilizzata in alcune spese')) {
        return res.status(400).json({
          error: 'Categoria in uso',
          message: 'Impossibile eliminare la categoria: è utilizzata in alcune spese'
        });
      }
      throw error;
    }

    logger.info(`Category deleted: ${id} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Categoria eliminata con successo'
    });

  } catch (error) {
    logger.error('Delete category error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'eliminazione della categoria'
    });
  }
};

// @desc    Ottieni statistiche categorie
// @route   GET /api/categories/stats
// @access  Private
const getCategoryStats = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { year, month } = req.query;

    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

    // Ottieni tutte le categorie della famiglia
    const categories = await Category.getCategoriesForFamily(familyId);

    // Per ogni categoria, calcola le statistiche
    const categoryStats = await Promise.all(
      categories.map(async (category) => {
        await category.updateStats();
        return {
          _id: category._id,
          name: category.name,
          color: category.color,
          icon: category.icon,
          totalExpenses: category.totalExpenses,
          lastUsed: category.lastUsed,
          isDefault: category.isDefault
        };
      })
    );

    // Ordina per totalExpenses decrescente
    categoryStats.sort((a, b) => b.totalExpenses - a.totalExpenses);

    res.json({
      success: true,
      data: {
        categories: categoryStats,
        period: {
          year: currentYear,
          month: currentMonth
        }
      }
    });

  } catch (error) {
    logger.error('Get category stats error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel recupero delle statistiche categorie'
    });
  }
};

// @desc    Aggiorna ordine categorie
// @route   PUT /api/categories/reorder
// @access  Private
const reorderCategories = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { categoryOrders } = req.body; // Array di { id, order }

    // Solo admin famiglia può riordinare categorie
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono riordinare le categorie'
      });
    }

    if (!Array.isArray(categoryOrders)) {
      return res.status(400).json({
        error: 'Dati non validi',
        message: 'categoryOrders deve essere un array'
      });
    }

    // Aggiorna l'ordine per ogni categoria
    const updatePromises = categoryOrders.map(async ({ id, order }) => {
      return await Category.findOneAndUpdate(
        {
          _id: id,
          familyId: familyId,
          isActive: true
        },
        { order: order },
        { new: true }
      );
    });

    await Promise.all(updatePromises);

    logger.info(`Categories reordered by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Ordine categorie aggiornato con successo'
    });

  } catch (error) {
    logger.error('Reorder categories error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante il riordinamento delle categorie'
    });
  }
};

module.exports = {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryStats,
  reorderCategories
}; 