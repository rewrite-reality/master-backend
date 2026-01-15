// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	// 1. JSON body parser
	app.use(express.json());

	// 2. Form-data / x-www-form-urlencoded parser
	// extended: true нужен для leads[add][0]
	app.use(express.urlencoded({ extended: true }));

	// 3. Global validation
	app.useGlobalPipes(new ValidationPipe({ transform: true }));

	// =========================
	// 🔥 Swagger / OpenAPI
	// =========================
	const config = new DocumentBuilder()
		.setTitle('Dispatch API')
		.setDescription('Backend API for Dispatch / AmoCRM / Masters')
		.setVersion('1.0.0')
		.addBearerAuth(
			{
				type: 'http',
				scheme: 'bearer',
				bearerFormat: 'JWT',
			},
			'JWT',
		)
		.build();

	const document = SwaggerModule.createDocument(app, config);
	SwaggerModule.setup('docs', app, document);

	// (опционально, но очень удобно)
	// JSON-спека для фронта / Postman / CI
	app.getHttpAdapter().get('/openapi.json', (req, res) => {
		res.json(document);
	});

	// =========================

	await app.listen(3000);
}
bootstrap();
