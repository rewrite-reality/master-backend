// prisma.config.ts
import { defineConfig } from '@prisma/config';

export default defineConfig({
	datasource: {
		// Явно указываем URL из переменной окружения
		url: process.env.DATABASE_URL,
	},
});
