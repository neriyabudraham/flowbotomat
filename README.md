# FlowBotomat

מערכת SaaS לבניית בוטים לוואטסאפ

## 🚀 התחלה מהירה

### דרישות
- Docker & Docker Compose
- Node.js 20+
- Git

### התקנה

1. **Clone the repository:**
```bash
git clone git@github.com:neriyabudraham/flowbotomat.git
cd flowbotomat
```

2. **Create environment file:**
```bash
cp env.example .env
# Edit .env with your values
```

3. **Start the application:**
```bash
docker-compose up -d
```

4. **Access:**
- Frontend: http://localhost:3748
- Backend API: http://localhost:4000
- Database: localhost:5451

## 📁 Project Structure

```
flowbotomat/
├── backend/           # Node.js API
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── routes/
│   │   ├── middlewares/
│   │   └── config/
│   └── Dockerfile
├── frontend/          # React App
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── store/
│   │   └── styles/
│   └── Dockerfile
├── database/          # SQL Scripts
├── docker-compose.yml
└── .env
```

## 🛠 Development

### Run locally with Docker:
```bash
docker-compose up
```

### View logs:
```bash
docker-compose logs -f
```

### Stop:
```bash
docker-compose down
```

## 📦 Deployment

Automatic deployment via GitHub Actions on push to `main` branch.

Manual deploy:
```bash
./deploy.sh
```

## 📄 License

Private - All rights reserved.
