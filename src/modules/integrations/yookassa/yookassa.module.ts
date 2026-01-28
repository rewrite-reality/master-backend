import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { YookassaModule as ExternalYookassaModule } from 'nestjs-yookassa';
import { PayoutsModule } from '../../payouts/payouts.module';
import { YookassaController } from './yookassa.controller';
import { YookassaService } from './yookassa.service';

@Module({
  imports: [
    ConfigModule,
    PayoutsModule,
    ExternalYookassaModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        shopId: configService.getOrThrow<string>('YOOKASSA_SHOP_ID'),
        apiKey: configService.getOrThrow<string>('YOOKASSA_SECRET_KEY'),
      }),
    }),
  ],
  controllers: [YookassaController],
  providers: [YookassaService],
  exports: [YookassaService],
})
export class YookassaIntegrationModule {}
