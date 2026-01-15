import { Module, Global, Logger } from '@nestjs/common'; // Добавьте Logger
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({
	imports: [
		BullModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				connection: {
					host: config.get('REDIS_HOST'),
					port: Number(config.get('REDIS_PORT')), // Важно привести к Number
					password: config.get('REDIS_PASSWORD') || undefined,
					// Ограничиваем реконнекты BullMQ, чтобы он не убил CPU при падении Redis
					reconnectOnError: (err) => {
						const targetError = 'READONLY';
						if (err.message.includes(targetError)) {
							// Only reconnect when the error starts with "READONLY"
							return true;
						}
						return false;
					},
				},
			}),
		}),
	],
	providers: [
		{
			provide: 'REDIS_CLIENT',
			useFactory: (config: ConfigService) => {
				const logger = new Logger('RedisClient');

				return new Redis({
					host: config.get('REDIS_HOST'),
					port: Number(config.get('REDIS_PORT')),
					password: config.get('REDIS_PASSWORD') || undefined,

					// 🔥 ВАЖНО: Защита от бесконечного спама при падении Redis
					maxRetriesPerRequest: null, // Нужно для потоков, если будете использовать
					retryStrategy: (times) => {
						// Если Redis лежит, пробуем подключиться через 50мс, 100мс, 200мс... до 2сек
						const delay = Math.min(times * 50, 2000);
						logger.warn(`Redis connection lost. Retrying in ${delay}ms...`);
						return delay;
					},
					// Защита от зависания TCP соединения
					keepAlive: 10000,
				});
			},
			inject: [ConfigService],
		},
	],
	exports: [BullModule, 'REDIS_CLIENT'],
})
export class RedisModule { }
