# Anibox

Anibox é uma plataforma para descoberta, organização e acompanhamento de anime, mangá, manhwa, manhua, light novels e webtoons.

## Estrutura

- `frontend/` — aplicação Angular.
- `backend/` — API NestJS e integração com Prisma.
- `backend/prisma/` — schema do banco.
- `supabase/` — migrations versionadas do PostgreSQL.
- `.github/workflows/` — validação e build de CI/CD.

## Desenvolvimento

### Frontend

```bash
cd frontend
npm install
npm start
```

### Backend

```bash
cd backend
npm install
npm run build
npm run start:dev
```

A API local utiliza o prefixo `/api/v1`.

## Banco de dados

O backend utiliza Prisma com PostgreSQL. As migrations SQL versionadas ficam em `supabase/migrations/`.

## Deploy

O frontend e o backend possuem projetos independentes na Vercel. A validação de cada alteração ocorre pelo CI e pelos deployments do GitHub/Vercel.
