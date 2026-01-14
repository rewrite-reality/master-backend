import { defineConfig } from '@prisma/config';
import * as dotenv from 'dotenv'; // <--- Импортируем dotenv

// Явно загружаем переменные из .env файла
dotenv.config();

export default defineConfig({
	datasource: {
		url: process.env.DATABASE_URL, // Теперь тут будет строка, а не undefined
	},
});
