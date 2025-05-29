const sgMail = require('@sendgrid/mail');
const logger = require('../utils/logger');

// Configura SendGrid con l'API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Invia un'email usando SendGrid
 * @param {Object} options - Opzioni email
 * @param {string} options.to - Destinatario
 * @param {string} options.subject - Oggetto email
 * @param {string} options.html - Contenuto HTML
 * @returns {Promise<void>}
 */
const sendEmail = async ({ to, subject, html }) => {
  try {
    const msg = {
      to,
      from: process.env.EMAIL_FROM,
      subject,
      html,
    };

    await sgMail.send(msg);
    logger.info(`Email inviata con successo a: ${to}`);
  } catch (error) {
    logger.error('Errore invio email:', error);
    throw new Error('Errore nell\'invio dell\'email');
  }
};

/**
 * Invia email di invito famiglia
 * @param {Object} options - Opzioni invito
 * @param {string} options.to - Email destinatario
 * @param {string} options.inviteUrl - URL invito
 * @param {string} options.familyName - Nome famiglia
 * @param {string} options.inviterName - Nome invitante
 * @returns {Promise<void>}
 */
const sendFamilyInvite = async ({ to, inviteUrl, familyName, inviterName }) => {
  const subject = `Invito a unirti alla famiglia "${familyName}"`;
  const html = `
    <h2>Invito Famiglia FamilyBudget</h2>
    <p>Ciao!</p>
    <p><strong>${inviterName}</strong> ti ha invitato a unirti alla famiglia <strong>"${familyName}"</strong> su FamilyBudget.</p>
    <p>Clicca sul link seguente per accettare l'invito:</p>
    <a href="${inviteUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Accetta Invito</a>
    <p>L'invito scadrà tra 7 giorni.</p>
    <p>Se non conosci questa persona, ignora questa email.</p>
    <br>
    <p>Team FamilyBudget</p>
  `;

  return sendEmail({ to, subject, html });
};

module.exports = {
  sendEmail,
  sendFamilyInvite
}; 