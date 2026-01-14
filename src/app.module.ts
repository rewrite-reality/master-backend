import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CoreModule } from './core/core.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrdersModule } from './modules/orders/orders.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AmocrmModule } from './modules/integrations/amocrm/amocrm.module';
import { EventsModule } from './events/events.module';
import { JobsModule } from './jobs/jobs.module';
import { ConfigModule } from './core/config/config.module';
import { DatabaseModule } from './core/database/database.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RedisModule } from './core/redis/redis.module';

@Module({
	imports: [CoreModule, AuthModule, UsersModule, OrdersModule, DispatchModule, NotificationsModule, AmocrmModule, EventsModule, JobsModule,
		ConfigModule,
		DatabaseModule,
		RedisModule,
		EventEmitterModule.forRoot({
			wildcard: true,
			delimiter: '.',
		})],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule { }
