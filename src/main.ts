// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ CORS (обязательно для Telegram/браузера + ngrok)
  app.enableCors({
    origin: true, // можно потом зажать до конкретных доменов
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'ngrok-skip-browser-warning',
    ],
  });

  // 1. JSON body parser
  app.use(express.json());

  // 2. x-www-form-urlencoded parser
  app.use(express.urlencoded({ extended: true }));

  // 3. Global validation
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  // Swagger
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

  app.getHttpAdapter().get('/openapi.json', (req, res) => {
    res.json(document);
  });

  // ✅ важно: чтобы ngrok мог достучаться (не только localhost)
  await app.listen(3000, '0.0.0.0');
}
bootstrap();
