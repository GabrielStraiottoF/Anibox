# Supabase

Estrutura de banco de dados versionada do Anibox.

As migrations SQL ficam em `supabase/migrations/` e devem ser aplicadas ao banco de produção a partir da branch `main` pela integração GitHub do Supabase.

O schema de dados atual do backend está definido em `backend/prisma/schema.prisma`. As migrations do Supabase serão geradas a partir dele quando a estrutura do banco for consolidada.
