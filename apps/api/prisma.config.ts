// Prisma CLI config. `.env` is loaded via dotenv (Prisma 7 no longer loads it
// automatically). The fallback keeps `prisma generate` working in CI, where no
// `.env` is present; migrate/runtime always run with a real DATABASE_URL.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? 'file:./dev.db',
  },
});
