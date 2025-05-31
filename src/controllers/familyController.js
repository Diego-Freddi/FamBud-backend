const Family = require('../models/Family');
const User = require('../models/User');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const { sendFamilyInvite } = require('../services/emailService');
const cloudinary = require('../config/cloudinary');

// @desc    Ottieni informazioni famiglia corrente
// @route   GET /api/family
// @access  Private
const getFamily = async (req, res) => {
  try {
    const { familyId } = req.user;

    if (!familyId) {
      return res.status(404).json({
        error: 'Famiglia non trovata',
        message: 'Non appartieni a nessuna famiglia'
      });
    }

    const family = await Family.findById(familyId)
      .populate('members.user', 'name email avatar isActive lastLogin')
      .populate('createdBy', 'name email')
      .select('-invitations.token'); // Non esporre i token

    if (!family) {
      return res.status(404).json({
        error: 'Famiglia non trovata',
        message: 'La famiglia non esiste più'
      });
    }

    // Pulizia automatica: rimuovi membri con utenti eliminati
    let needsCleanup = false;
    const originalMembersCount = family.members.length;
    
    family.members = family.members.filter(member => {
      if (!member.user) {
        needsCleanup = true;
        logger.warn(`Removing member with deleted user from family ${familyId}`);
        return false;
      }
      return true;
    });

    // Salva solo se necessario
    if (needsCleanup) {
      await family.save();
      logger.info(`Cleaned up ${originalMembersCount - family.members.length} deleted user references from family ${familyId}`);
    }

    // Calcola statistiche famiglia
    const stats = await family.getStats();

    // Separa membri attivi ed ex-membri
    const activeMembers = family.getActiveMembers();
    const formerMembers = family.getFormerMembers();

    res.json({
      success: true,
      data: {
        family: {
          ...family.toObject(),
          activeMembers,
          formerMembers
        },
        stats,
        userRole: family.members.find(m => 
          m.user && m.user._id.toString() === req.user._id.toString()
        )?.role || 'member'
      }
    });

  } catch (error) {
    logger.error('Get family error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel recupero della famiglia'
    });
  }
};

// @desc    Aggiorna informazioni famiglia
// @route   PUT /api/family
// @access  Private (Admin only)
const updateFamily = async (req, res) => {
  try {
    const { familyId } = req.user;

    // Solo admin famiglia può modificare
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono modificare le informazioni'
      });
    }

    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({
        error: 'Famiglia non trovata',
        message: 'La famiglia non esiste'
      });
    }

    const { name, description, settings } = req.body;

    // Aggiorna campi
    if (name !== undefined) family.name = name.trim();
    if (description !== undefined) family.description = description.trim();
    if (settings !== undefined) {
      family.settings = { ...family.settings, ...settings };
    }

    await family.save();

    // Popola i dati per la risposta
    await family.populate('members.user', 'name email avatar isActive');

    logger.info(`Family updated: ${familyId} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Famiglia aggiornata con successo',
      data: { family }
    });

  } catch (error) {
    logger.error('Update family error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Errori di validazione',
        message: errors.join(', ')
      });
    }

    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'aggiornamento della famiglia'
    });
  }
};

// @desc    Invita nuovo membro alla famiglia
// @route   POST /api/family/invite
// @access  Private (Admin only)
const inviteMember = async (req, res) => {
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
    const { email, role = 'member' } = req.body;

    // Solo admin famiglia può invitare
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono invitare nuovi membri'
      });
    }

    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({
        error: 'Famiglia non trovata',
        message: 'La famiglia non esiste'
      });
    }

    // Verifica che l'utente non sia già membro
    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.familyId) {
      if (existingUser.familyId.toString() === familyId) {
        return res.status(400).json({
          error: 'Utente già membro',
          message: 'Questo utente è già membro della famiglia'
        });
      } else {
        return res.status(400).json({
          error: 'Utente già in famiglia',
          message: 'Questo utente appartiene già a un\'altra famiglia'
        });
      }
    }

    // Verifica che non ci sia già un invito pendente
    const existingInvitation = family.invitations.find(inv => 
      inv.email === email && inv.status === 'pending'
    );

    if (existingInvitation) {
      return res.status(400).json({
        error: 'Invito già inviato',
        message: 'C\'è già un invito pendente per questa email'
      });
    }

    // Genera token di invito
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 giorni

    // Aggiungi invito alla famiglia
    const invitation = {
      email,
      role,
      token: crypto.createHash('sha256').update(inviteToken).digest('hex'),
      expiresAt: inviteExpiry,
      invitedBy: req.user._id,
      status: 'pending'
    };

    family.invitations.push(invitation);
    await family.save();

    // URL di invito (in produzione sarà il frontend)
    const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/join-family/${inviteToken}`;

    // Invia email di invito
    try {
      await sendFamilyInvite({
        to: email,
        inviteUrl,
        familyName: family.name,
        inviterName: req.user.name
      });
      
      logger.info(`Family invitation email sent to: ${email}`);
    } catch (emailError) {
      logger.error('Email sending error:', emailError);
      // Non bloccare il processo se l'email fallisce
    }

    logger.info(`Family invitation sent: ${email} to family ${familyId} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Invito inviato con successo',
      data: {
        invitation: {
          email,
          role,
          expiresAt: inviteExpiry,
          invitedBy: req.user.name
        },
        // In sviluppo, restituisci il token per testing
        ...(process.env.NODE_ENV === 'development' && { inviteToken })
      }
    });

  } catch (error) {
    logger.error('Invite member error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'invio dell\'invito'
    });
  }
};

// @desc    Accetta invito famiglia
// @route   POST /api/family/join/:token
// @access  Private
const joinFamily = async (req, res) => {
  try {
    const { token } = req.params;
    const user = req.user;

    // Verifica che l'utente non appartenga già a una famiglia
    if (user.familyId) {
      return res.status(400).json({
        error: 'Già in famiglia',
        message: 'Appartieni già a una famiglia'
      });
    }

    // Hash del token per confronto
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Trova famiglia con invito valido
    const family = await Family.findOne({
      'invitations.token': hashedToken,
      'invitations.expiresAt': { $gt: Date.now() },
      'invitations.status': 'pending'
    });

    if (!family) {
      return res.status(400).json({
        error: 'Invito non valido',
        message: 'L\'invito non è valido o è scaduto'
      });
    }

    // Trova l'invito specifico
    const invitation = family.invitations.find(inv => 
      inv.token === hashedToken && inv.status === 'pending'
    );

    if (!invitation) {
      return res.status(400).json({
        error: 'Invito non trovato',
        message: 'L\'invito non è stato trovato'
      });
    }

    // Verifica che l'email corrisponda
    if (invitation.email !== user.email) {
      return res.status(400).json({
        error: 'Email non corrispondente',
        message: 'L\'invito non è stato inviato a questa email'
      });
    }

    // Aggiungi utente alla famiglia
    family.members.push({
      user: user._id,
      role: invitation.role,
      joinedAt: new Date(),
      isActive: true
    });

    // Aggiorna stato invito
    invitation.status = 'accepted';
    invitation.acceptedAt = new Date();

    await family.save();

    // Aggiorna utente
    user.familyId = family._id;
    user.role = invitation.role;
    await user.save();

    // Popola i dati per la risposta
    await family.populate('members.user', 'name email avatar');

    logger.info(`User joined family: ${user.email} joined ${family.name}`);

    res.json({
      success: true,
      message: 'Ti sei unito alla famiglia con successo!',
      data: {
        family: {
          _id: family._id,
          name: family.name,
          description: family.description,
          role: invitation.role
        }
      }
    });

  } catch (error) {
    logger.error('Join family error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'adesione alla famiglia'
    });
  }
};

// @desc    Verifica dettagli invito famiglia
// @route   GET /api/family/invite/:token
// @access  Public
const verifyInvite = async (req, res) => {
  try {
    const { token } = req.params;

    // Hash del token per confronto
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Trova famiglia con invito valido
    const family = await Family.findOne({
      'invitations.token': hashedToken,
      'invitations.expiresAt': { $gt: Date.now() },
      'invitations.status': 'pending'
    }).populate('createdBy', 'name email');

    if (!family) {
      return res.status(400).json({
        error: 'Invito non valido',
        message: 'L\'invito non è valido o è scaduto'
      });
    }

    // Trova l'invito specifico
    const invitation = family.invitations.find(inv => 
      inv.token === hashedToken && inv.status === 'pending'
    );

    if (!invitation) {
      return res.status(400).json({
        error: 'Invito non trovato',
        message: 'L\'invito non è stato trovato'
      });
    }

    // Popola informazioni dell'invitante
    await family.populate('invitations.invitedBy', 'name email');
    const inviter = family.invitations.find(inv => inv.token === hashedToken)?.invitedBy;

    res.json({
      success: true,
      data: {
        familyName: family.name,
        familyDescription: family.description,
        inviterName: inviter?.name || 'Utente sconosciuto',
        inviterEmail: inviter?.email,
        invitedEmail: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt
      }
    });

  } catch (error) {
    logger.error('Verify invite error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante la verifica dell\'invito'
    });
  }
};

// @desc    Aggiorna ruolo membro famiglia
// @route   PUT /api/family/members/:userId
// @access  Private (Admin only)
const updateMemberRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const { familyId } = req.user;

    // Solo admin famiglia può modificare ruoli
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono modificare i ruoli'
      });
    }

    // Non può modificare il proprio ruolo
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        error: 'Operazione non permessa',
        message: 'Non puoi modificare il tuo stesso ruolo'
      });
    }

    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({
        error: 'Famiglia non trovata',
        message: 'La famiglia non esiste'
      });
    }

    // Trova il membro
    const member = family.members.find(m => 
      m.user.toString() === userId && m.isActive
    );

    if (!member) {
      return res.status(404).json({
        error: 'Membro non trovato',
        message: 'Il membro non esiste o non è attivo'
      });
    }

    // Aggiorna ruolo
    member.role = role;
    await family.save();

    // Aggiorna anche l'utente
    await User.findByIdAndUpdate(userId, { role });

    logger.info(`Member role updated: ${userId} to ${role} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Ruolo aggiornato con successo',
      data: {
        userId,
        newRole: role
      }
    });

  } catch (error) {
    logger.error('Update member role error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'aggiornamento del ruolo'
    });
  }
};

// @desc    Rimuovi membro dalla famiglia
// @route   DELETE /api/family/members/:userId
// @access  Private (Admin only)
const removeMember = async (req, res) => {
  try {
    const { userId } = req.params;
    const { familyId } = req.user;

    // Solo admin famiglia può rimuovere membri
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono rimuovere membri'
      });
    }

    // Non può rimuovere se stesso
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        error: 'Operazione non permessa',
        message: 'Non puoi rimuovere te stesso dalla famiglia'
      });
    }

    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({
        error: 'Famiglia non trovata',
        message: 'La famiglia non esiste'
      });
    }

    // Trova il membro
    const member = family.members.find(m => 
      m.user.toString() === userId && m.isActive
    );

    if (!member) {
      return res.status(404).json({
        error: 'Membro non trovato',
        message: 'Il membro non esiste o non è attivo'
      });
    }

    // Disattiva il membro (soft delete)
    member.isActive = false;
    member.removedAt = new Date();
    member.removedBy = req.user._id;

    await family.save();

    // Rimuovi famiglia dall'utente
    await User.findByIdAndUpdate(userId, { 
      familyId: null, 
      role: 'member' 
    });

    logger.info(`Member removed: ${userId} from family ${familyId} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Membro rimosso dalla famiglia con successo'
    });

  } catch (error) {
    logger.error('Remove member error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante la rimozione del membro'
    });
  }
};

// @desc    Lascia famiglia
// @route   POST /api/family/leave
// @access  Private
const leaveFamily = async (req, res) => {
  try {
    const { familyId } = req.user;
    const user = req.user;

    if (!familyId) {
      return res.status(400).json({
        error: 'Nessuna famiglia',
        message: 'Non appartieni a nessuna famiglia'
      });
    }

    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({
        error: 'Famiglia non trovata',
        message: 'La famiglia non esiste'
      });
    }

    // Verifica se è l'ultimo admin
    const activeAdmins = family.members.filter(m => 
      m.isActive && m.role === 'admin'
    );

    if (user.role === 'admin' && activeAdmins.length === 1) {
      return res.status(400).json({
        error: 'Ultimo admin',
        message: 'Non puoi lasciare la famiglia: sei l\'ultimo admin. Nomina prima un altro admin.'
      });
    }

    // Trova e disattiva il membro
    const member = family.members.find(m => 
      m.user.toString() === user._id.toString() && m.isActive
    );

    if (member) {
      member.isActive = false;
      member.removedAt = new Date();
    }

    await family.save();

    // Rimuovi famiglia dall'utente
    user.familyId = null;
    user.role = 'member';
    await user.save();

    logger.info(`User left family: ${user.email} left ${family.name}`);

    res.json({
      success: true,
      message: 'Hai lasciato la famiglia con successo'
    });

  } catch (error) {
    logger.error('Leave family error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'uscita dalla famiglia'
    });
  }
};

// @desc    Ottieni inviti pendenti
// @route   GET /api/family/invitations
// @access  Private (Admin only)
const getInvitations = async (req, res) => {
  try {
    const { familyId } = req.user;

    // Solo admin famiglia può vedere inviti
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono vedere gli inviti'
      });
    }

    const family = await Family.findById(familyId)
      .populate('invitations.invitedBy', 'name email')
      .select('invitations');

    if (!family) {
      return res.status(404).json({
        error: 'Famiglia non trovata',
        message: 'La famiglia non esiste'
      });
    }

    // Filtra inviti pendenti e non scaduti
    const activeInvitations = family.invitations.filter(inv => 
      inv.status === 'pending' && inv.expiresAt > Date.now()
    ).map(inv => ({
      _id: inv._id,
      email: inv.email,
      role: inv.role,
      invitedBy: inv.invitedBy,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt
    }));

    res.json({
      success: true,
      data: { invitations: activeInvitations }
    });

  } catch (error) {
    logger.error('Get invitations error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore nel recupero degli inviti'
    });
  }
};

// @desc    Cancella invito
// @route   DELETE /api/family/invitations/:invitationId
// @access  Private (Admin only)
const cancelInvitation = async (req, res) => {
  try {
    const { invitationId } = req.params;
    const { familyId } = req.user;

    // Solo admin famiglia può cancellare inviti
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono cancellare inviti'
      });
    }

    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({
        error: 'Famiglia non trovata',
        message: 'La famiglia non esiste'
      });
    }

    // Trova l'invito
    const invitation = family.invitations.id(invitationId);
    if (!invitation) {
      return res.status(404).json({
        error: 'Invito non trovato',
        message: 'L\'invito non esiste'
      });
    }

    // Aggiorna stato invito
    invitation.status = 'cancelled';
    invitation.cancelledAt = new Date();
    invitation.cancelledBy = req.user._id;

    await family.save();

    logger.info(`Invitation cancelled: ${invitationId} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Invito cancellato con successo'
    });

  } catch (error) {
    logger.error('Cancel invitation error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante la cancellazione dell\'invito'
    });
  }
};

// @desc    Upload banner famiglia
// @route   POST /api/family/upload-banner
// @access  Private (Admin only)
const uploadFamilyBanner = async (req, res) => {
  try {
    const { familyId } = req.user;

    // Solo admin famiglia può modificare banner
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono modificare il banner'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'File mancante',
        message: 'Nessun file banner caricato'
      });
    }

    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({
        error: 'Famiglia non trovata',
        message: 'La famiglia non esiste'
      });
    }

    // Upload su Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'family-banners',
          transformation: [
            { width: 1200, height: 400, crop: 'fill', quality: 'auto' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    // Elimina banner precedente se esiste
    if (family.banner && family.banner.includes('cloudinary.com')) {
      try {
        const publicId = family.banner.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`family-banners/${publicId}`);
      } catch (deleteError) {
        logger.warn('Error deleting old banner:', deleteError);
      }
    }

    // Aggiorna famiglia con nuovo banner
    family.banner = uploadResult.secure_url;
    await family.save();

    logger.info(`Family banner updated: ${familyId} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Banner famiglia aggiornato con successo',
      data: { bannerUrl: uploadResult.secure_url }
    });

  } catch (error) {
    logger.error('Upload family banner error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'upload del banner'
    });
  }
};

// @desc    Imposta banner famiglia tramite URL
// @route   PUT /api/family/set-banner-url
// @access  Private (Admin only)
const setFamilyBannerUrl = async (req, res) => {
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
    const { bannerUrl } = req.body;

    // Solo admin famiglia può modificare banner
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono modificare il banner'
      });
    }

    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({
        error: 'Famiglia non trovata',
        message: 'La famiglia non esiste'
      });
    }

    // Aggiorna banner
    family.banner = bannerUrl.trim();
    await family.save();

    logger.info(`Family banner URL set: ${familyId} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Banner famiglia impostato con successo',
      data: { bannerUrl: family.banner }
    });

  } catch (error) {
    logger.error('Set family banner URL error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante l\'impostazione del banner'
    });
  }
};

// @desc    Rimuovi banner famiglia
// @route   DELETE /api/family/banner
// @access  Private (Admin only)
const removeFamilyBanner = async (req, res) => {
  try {
    const { familyId } = req.user;

    // Solo admin famiglia può rimuovere banner
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permessi insufficienti',
        message: 'Solo gli admin famiglia possono rimuovere il banner'
      });
    }

    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({
        error: 'Famiglia non trovata',
        message: 'La famiglia non esiste'
      });
    }

    // Elimina da Cloudinary se è un'immagine caricata
    if (family.banner && family.banner.includes('cloudinary.com')) {
      try {
        const publicId = family.banner.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`family-banners/${publicId}`);
      } catch (deleteError) {
        logger.warn('Error deleting banner from Cloudinary:', deleteError);
      }
    }

    // Rimuovi banner dalla famiglia
    family.banner = null;
    await family.save();

    logger.info(`Family banner removed: ${familyId} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Banner famiglia rimosso con successo'
    });

  } catch (error) {
    logger.error('Remove family banner error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      message: 'Errore durante la rimozione del banner'
    });
  }
};

module.exports = {
  getFamily,
  updateFamily,
  inviteMember,
  joinFamily,
  updateMemberRole,
  removeMember,
  leaveFamily,
  getInvitations,
  cancelInvitation,
  uploadFamilyBanner,
  setFamilyBannerUrl,
  removeFamilyBanner,
  verifyInvite
}; 