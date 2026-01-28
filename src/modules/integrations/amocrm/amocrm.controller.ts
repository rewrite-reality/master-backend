import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { AmoCrmService } from './amocrm.service';
import { AmoWebhookDto } from './dto/amocrm-webhook.dto';

@Controller('webhooks/amocrm')
export class AmoCrmController {
  private readonly logger = new Logger(AmoCrmController.name);

  constructor(private readonly amoCrmService: AmoCrmService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() dto: AmoWebhookDto) {
    try {
      return await this.amoCrmService.handleIncomingWebhook(dto);
    } catch (err: any) {
      this.logger.error('AmoCRM webhook processing failed', err?.stack || err);
      // Важно: всегда 200, чтобы AmoCRM не долбил ретраями
      return { status: 'accepted' };
    }
  }
}
