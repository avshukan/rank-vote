// Prisma CLI config. `.env` is loaded via dotenv (Prisma 7 no longer loads it
// automatically). The fallback is only parsed during client generation;
// migrations and runtime receive a real DATABASE_URL.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url:
      process.env['DATABASE_URL'] ??
      'postgresql://rank_vote:rank_vote@localhost:5432/rank_vote?schema=public',
  },
});
