const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configurazione Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage per avatar
const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'familybudget/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      {
        width: 200,
        height: 200,
        crop: 'fill',
        gravity: 'face',
        quality: 'auto:good'
      }
    ],
    public_id: (req, file) => {
      // Genera un ID unico per l'avatar
      return `avatar_${req.user._id}_${Date.now()}`;
    },
  },
});

// Funzione per eliminare immagine da Cloudinary
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Errore eliminazione immagine Cloudinary:', error);
    throw error;
  }
};

// Funzione per estrarre public_id dall'URL Cloudinary
const extractPublicId = (url) => {
  if (!url || !url.includes('cloudinary.com')) return null;
  
  // Estrae il public_id dall'URL Cloudinary
  // Esempio: https://res.cloudinary.com/demo/image/upload/v1234567890/familybudget/avatars/avatar_123_456.jpg
  const parts = url.split('/');
  const uploadIndex = parts.indexOf('upload');
  if (uploadIndex === -1) return null;
  
  // Prende tutto dopo 'upload/v{version}/' e rimuove l'estensione
  const pathAfterVersion = parts.slice(uploadIndex + 2).join('/');
  return pathAfterVersion.replace(/\.[^/.]+$/, ''); // Rimuove estensione
};

module.exports = {
  cloudinary,
  avatarStorage,
  deleteImage,
  extractPublicId
}; 