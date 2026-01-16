import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { AmoCrmController } from './amocrm/amocrm.controller';
import { AmoCrmService } from './amocrm/amocrm.service';
import { AmoCrmMapper } from './amocrm/amocrm.mapper';
import { AmoCrmApiService } from './amocrm/amocrm.api.service';
import { IdempotencyService } from './idempotency/idempotency.service';
import { DadataService } from './dadata/dadata.service';
import { DispatchModule } from '../dispatch/dispatch.module';
import { AmoCrmSyncService } from './amocrm/amocrm.sync.service';
import { AmoCrmSyncProcessor } from './amocrm/amocrm-sync.processor';
import { AmoCrmSyncScheduler } from './amocrm/amocrm-sync.scheduler';

@Module({
	imports: [
		ConfigModule,
		DispatchModule,
		BullModule.registerQueue({
			name: 'amocrm-sync',
		}),
	],
	controllers: [AmoCrmController],
	providers: [
		IdempotencyService,
		DadataService,
		AmoCrmService,
		AmoCrmMapper,
		AmoCrmApiService,
		AmoCrmSyncService,
		AmoCrmSyncProcessor,
		AmoCrmSyncScheduler,
	],
	exports: [DadataService, IdempotencyService, AmoCrmSyncService],
})
export class IntegrationsModule { }
