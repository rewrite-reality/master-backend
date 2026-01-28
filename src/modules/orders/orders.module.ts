import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { MapService } from '../../core/utils/map.service';

@Module({
  imports: [IntegrationsModule, PayoutsModule],
  controllers: [OrdersController],
  providers: [OrdersService, MapService],
  exports: [OrdersService],
})
export class OrdersModule {}
