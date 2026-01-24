import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { OrdersModule } from '../orders/orders.module';
import { DistrictsModule } from '../districts/districts.module';
import { SpecialtiesModule } from '../specialties/specialties.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { AdminMastersController } from './admin-masters.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminDistrictsController } from './admin-districts.controller';
import { AdminSpecialtiesController } from './admin-specialties.controller';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';

@Module({
	imports: [
		AuthModule,
		UsersModule,
		OrdersModule,
		DistrictsModule,
		SpecialtiesModule,
		PayoutsModule,
	],
	controllers: [
		AdminMastersController,
		AdminOrdersController,
		AdminDistrictsController,
		AdminSpecialtiesController,
		AdminStatsController,
	],
	providers: [AdminStatsService],
})
export class AdminModule { }
