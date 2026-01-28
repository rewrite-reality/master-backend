import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from './config/config.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [DatabaseModule, ConfigModule, RedisModule],
})
export class CoreModule {}
