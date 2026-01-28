import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    // Создаём пул соединений PostgreSQL
    const connectionString = configService.get<string>('DATABASE_URL');
    const pool = new Pool({ connectionString });

    // Создаём адаптер (требование Prisma 7)
    const adapter = new PrismaPg(pool);

    // Передаём адаптер в PrismaClient
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
