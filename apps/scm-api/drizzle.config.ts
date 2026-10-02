import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile();
} catch {
  // .env 없이도 generate 는 동작한다.
}

export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'mysql://root:root@localhost:3306/lh_scm',
  },
});
