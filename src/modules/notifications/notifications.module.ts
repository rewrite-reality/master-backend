import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { DispatchModule } from '../dispatch/dispatch.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { TelegramService } from './telegram/telegram.service';
import { TelegramUpdate } from './telegram/telegram.update';
import { OrderCreatedListener } from './listeners/order-created.listener';
import { OrderAssignedListener } from './listeners/order-assigned.listener';
import { PrismaService } from '../../core/database/prisma.service';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsProcessor } from './notifications.processor';

@Module({
  imports: [
    DispatchModule,
    OrdersModule,
    BullModule.registerQueue({
      name: 'notifications',
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      },
    }),
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        token: configService.get<string>('TELEGRAM_BOT_TOKEN') || '',
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    TelegramService,
    TelegramUpdate,
    OrderCreatedListener,
    OrderAssignedListener,
    NotificationsProcessor,
    PrismaService,
  ],
})
export class NotificationsModule {}
