import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

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
	exports: [BullModule],
})
export class RedisModule { }
