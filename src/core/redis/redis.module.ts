import { Module, Global } from '@nestjs/common';
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
					port: config.get('REDIS_PORT'),
					password: config.get('REDIS_PASSWORD') || undefined,
				},
			}),
		}),
	],
	providers: [
		{
			provide: 'REDIS_CLIENT',
			useFactory: (config: ConfigService) => {
				return new Redis({
					host: config.get('REDIS_HOST'),
					port: config.get('REDIS_PORT'),
					password: config.get('REDIS_PASSWORD') || undefined,
				});
			},
			inject: [ConfigService],
		},
	],
	exports: [BullModule, 'REDIS_CLIENT'],
})
export class RedisModule { }
