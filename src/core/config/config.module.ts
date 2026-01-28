import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true, // Доступен везде без импорта
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(3000),

        // Обязательные переменные (упадет, если их нет)
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        TELEGRAM_BOT_TOKEN: Joi.string().required(),

        // Redis
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
        REDIS_PASSWORD: Joi.string().optional().allow(''),
      }),
    }),
  ],
})
export class ConfigModule {}
