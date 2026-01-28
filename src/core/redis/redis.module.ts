import { Module, Global, Logger } from '@nestjs/common'; // گ"گ?گ+گّگ?‘?‘'گç Logger
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
          host: config.get('REDIS_HOST', 'localhost'),
          port: Number(config.get('REDIS_PORT') ?? 6379), // گ'گّگگ?گ? گُ‘?گٌگ?گç‘?‘'گٌ گَ Number
          password: config.get('REDIS_PASSWORD') || undefined,
          // گ?گ?‘?گّگ?گٌ‘طگٌگ?گّگçگ? ‘?گçگَگ?گ?گ?گçگَ‘'‘< BullMQ, ‘ط‘'گ?گ+‘< گ?گ? گ?گç ‘?گ+گٌگ> CPU گُ‘?گٌ گُگّگ?گçگ?گٌگٌ Redis
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
          host: config.get('REDIS_HOST', 'localhost'),
          port: Number(config.get('REDIS_PORT') ?? 6379),
          password: config.get('REDIS_PASSWORD') || undefined,

          // à?"? گ'گ?گ-گ?گ?: گ-گّ‘%گٌ‘'گّ گ?‘' گ+گç‘?گَگ?گ?گç‘طگ?گ?گ?گ? ‘?گُگّگ?گّ گُ‘?گٌ گُگّگ?گçگ?گٌگٌ Redis
          maxRetriesPerRequest: null, // گ?‘?گگ?گ? گ?گ>‘? گُگ?‘'گ?گَگ?گ?, گç‘?گ>گٌ گ+‘?گ?گç‘'گç گٌ‘?گُگ?گ>‘?گْگ?گ?گّ‘'‘?
          retryStrategy: (times) => {
            // گ‘?گ>گٌ Redis گ>گçگگٌ‘', گُ‘?گ?گ+‘?گçگ? گُگ?گ?گَگ>‘?‘طگٌ‘'‘?‘?‘? ‘طگç‘?گçگْ 50گ?‘?, 100گ?‘?, 200گ?‘?... گ?گ? 2‘?گçگَ
            const delay = Math.min(times * 50, 2000);
            logger.warn(`Redis connection lost. Retrying in ${delay}ms...`);
            return delay;
          },
          // گ-گّ‘%گٌ‘'گّ گ?‘' گْگّگ?گٌ‘?گّگ?گٌ‘? TCP ‘?گ?گçگ?گٌگ?گçگ?گٌ‘?
          keepAlive: 10000,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [BullModule, 'REDIS_CLIENT'],
})
export class RedisModule {}
