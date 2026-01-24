import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CoreModule } from './core/core.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrdersModule } from './modules/orders/orders.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { EventsModule } from './events/events.module';
import { ConfigModule } from './core/config/config.module';
import { DatabaseModule } from './core/database/database.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RedisModule } from './core/redis/redis.module';
import { DistrictsModule } from './modules/districts/districts.module';
import { SpecialtiesModule } from './modules/specialties/specialties.module';
import { ScheduleModule } from '@nestjs/schedule';
import { DevModule } from './modules/dev/dev.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
	imports: [CoreModule, AuthModule, UsersModule, OrdersModule, DispatchModule, NotificationsModule, IntegrationsModule, EventsModule,
		ConfigModule,
		DatabaseModule,
		RedisModule,
		DevModule,
		ScheduleModule.forRoot(),
		EventEmitterModule.forRoot({
			wildcard: true,
			delimiter: '.',
		}),
		DistrictsModule,
		SpecialtiesModule,
		AdminModule],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule { }
