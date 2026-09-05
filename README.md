# Anibox

Anibox é uma plataforma para descoberta, organização e acompanhamento de anime, mangá, manhwa, manhua, light novels e webtoons.

## Estrutura

- `frontend/` — aplicação Angular.
- `backend/` — API NestJS e integração com Prisma.
- `backend/prisma/` — schema e migrations do Prisma.
- `supabase/` — migrations SQL para PostgreSQL/Supabase.
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

A API utiliza o prefixo `/api/v1`.

## Banco de dados

O backend utiliza Prisma com PostgreSQL. Para ambientes reais, aplique as migrations versionadas antes de iniciar a aplicação:

```bash
cd backend
npm run prisma:migrate:deploy
```

Para Supabase, o SQL equivalente também está versionado em `supabase/migrations/`.

## Deploy

O frontend e o backend possuem projetos independentes na Vercel. O CI valida instalação, build e testes disponíveis antes do build das imagens Docker.

O frontend usa `ANIBOX_API_URL` quando fornecida; sem ela, o build de produção utiliza o domínio atual do backend Vercel configurado no projeto.

As variáveis de ambiente e a conexão do banco devem ser configuradas no provedor de hospedagem antes de habilitar os fluxos autenticados em produção.
