# 🏦 FamilyBudget - Backend API

Backend API per l'applicazione di gestione delle spese familiari FamilyBudget.

## 🚀 Stack Tecnologico

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB con Mongoose
- **Autenticazione**: JWT + bcrypt
- **Validazione**: express-validator
- **Security**: helmet, cors, rate-limiting

## 📋 Prerequisiti

- Node.js (v16 o superiore)
- MongoDB (locale o MongoDB Atlas)
- npm o yarn

## ⚙️ Installazione

```bash
# Clona il repository
git clone <url-repository-backend>
cd familybudget-backend

# Installa le dipendenze
npm install

# Copia il file di configurazione
cp .env.example .env

# Configura le variabili ambiente nel file .env
```

## 🔧 Configurazione

Crea un file `.env` nella root del progetto con le seguenti variabili:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/familybudget
# oppure per MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/familybudget

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=7d

# Email (per reset password)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Frontend URL (per CORS)
FRONTEND_URL=http://localhost:3000
```

## 🏃‍♂️ Avvio

```bash
# Sviluppo (con nodemon)
npm run dev

# Produzione
npm start

# Test
npm test
```

## 📚 API Endpoints

### Autenticazione
- `POST /api/auth/register` - Registrazione utente
- `POST /api/auth/login` - Login utente
- `POST /api/auth/reset-password` - Reset password

### Spese
- `GET /api/expenses` - Lista spese
- `POST /api/expenses` - Crea nuova spesa
- `PUT /api/expenses/:id` - Modifica spesa
- `DELETE /api/expenses/:id` - Elimina spesa

### Entrate
- `GET /api/incomes` - Lista entrate
- `POST /api/incomes` - Crea nuova entrata
- `PUT /api/incomes/:id` - Modifica entrata
- `DELETE /api/incomes/:id` - Elimina entrata

### Categorie
- `GET /api/categories` - Lista categorie
- `POST /api/categories` - Crea categoria
- `PUT /api/categories/:id` - Modifica categoria
- `DELETE /api/categories/:id` - Elimina categoria

### Budget
- `GET /api/budgets` - Lista budget
- `POST /api/budgets` - Crea budget
- `PUT /api/budgets/:id` - Modifica budget
- `DELETE /api/budgets/:id` - Elimina budget

### Famiglia
- `GET /api/family` - Info famiglia
- `POST /api/family/invite` - Invita membro
- `PUT /api/family/members/:id` - Modifica membro
- `DELETE /api/family/members/:id` - Rimuovi membro

## 🗂️ Struttura Progetto

```
backend/
├── src/
│   ├── controllers/     # Controller per gestire le richieste
│   ├── models/         # Modelli Mongoose
│   ├── routes/         # Definizione routes
│   ├── middleware/     # Middleware personalizzati
│   ├── utils/          # Utility functions
│   ├── config/         # Configurazioni
│   └── app.js          # Setup Express app
├── tests/              # Test files
├── .env.example        # Template variabili ambiente
├── .gitignore
├── package.json
└── server.js           # Entry point
```

## 🧪 Testing

```bash
# Esegui tutti i test
npm test

# Test con coverage
npm run test:coverage

# Test in watch mode
npm run test:watch
```

## 🚀 Deploy

### Render/Railway
1. Connetti il repository GitHub
2. Configura le variabili ambiente
3. Deploy automatico

### Variabili Ambiente Produzione
- `NODE_ENV=production`
- `MONGODB_URI` (MongoDB Atlas)
- `JWT_SECRET` (chiave sicura)
- `FRONTEND_URL` (URL frontend produzione)

## 📝 Note di Sviluppo

- Tutte le API richiedono autenticazione JWT (eccetto auth endpoints)
- Validazione input su tutti gli endpoints
- Error handling centralizzato
- Logging strutturato per debugging
- Rate limiting per sicurezza

## 🔗 Repository Correlati

- **Frontend**: [FamilyBudget Frontend](link-al-repo-frontend)
- **Documentazione**: [Progetto.md](../Progetto.md)
- **Roadmap**: [RoadMap.md](../RoadMap.md)

## 📄 Licenza

MIT License - vedi [LICENSE](LICENSE) per dettagli. 