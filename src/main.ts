import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	const config = app.get(ConfigService);
	const port = config.get('PORT');

	// Включаем валидацию запросов (для DTO)
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true, // Удаляет лишние поля из body
			forbidNonWhitelisted: true, // Кидает ошибку, если есть лишние поля
			transform: true, // Авто-преобразование типов (string -> number)
		}),
	);

	// CORS (для Mini App с localhost при разработке)
	app.enableCors({
		origin: '*', // В продакшене замените на домен Mini App
	});

	await app.listen(port);
	console.log(`🚀 Application is running on: http://localhost:${port}`);
}
bootstrap();
