// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express'; // <-- Импорт express

async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	// 1. Включаем парсинг JSON (обычно уже есть)
	app.use(express.json());

	// 2. 🔥 ВАЖНО: Включаем парсинг Form-Data (x-www-form-urlencoded)
	// extended: true нужен, чтобы парсить вложенные объекты (leads[add][0])
	app.use(express.urlencoded({ extended: true }));

	app.useGlobalPipes(new ValidationPipe({ transform: true }));

	await app.listen(3000);
}
bootstrap();
