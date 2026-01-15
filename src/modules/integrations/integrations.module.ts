import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AmoCrmController } from './amocrm/amocrm.controller';
import { AmoCrmService } from './amocrm/amocrm.service';
import { AmoCrmMapper } from './amocrm/amocrm.mapper';
import { AmoCrmApiService } from './amocrm/amocrm.api.service';
import { IdempotencyService } from './idempotency/idempotency.service';
import { DadataService } from './dadata/dadata.service';
import { DispatchModule } from '../dispatch/dispatch.module';

@Module({
	imports: [ConfigModule, DispatchModule],
	controllers: [AmoCrmController],
	providers: [
		IdempotencyService,
		DadataService,
		AmoCrmService,
		AmoCrmMapper,
		AmoCrmApiService,
	],
	exports: [DadataService, IdempotencyService],
})
export class IntegrationsModule { }
