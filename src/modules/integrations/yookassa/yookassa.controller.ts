import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { YookassaService } from './yookassa.service';

@Controller({ path: ['yookassa', 'integrations/yookassa'] })
export class YookassaController {
  constructor(private readonly yookassaService: YookassaService) {}

  @Post('create-payment')
  @UseGuards(JwtAuthGuard)
  async createPayment(
    @CurrentUser() user: { id: string },
    @Body() dto: CreatePaymentDto,
  ) {
    return this.yookassaService.createPayment(user.id, dto.amount);
  }

  @Post('webhook')
  async webhook(@Body() event: any) {
    await this.yookassaService.handleWebhook(event);
    return { status: 'ok' };
  }

  @Post('admin/sync/:id')
  @UseGuards(JwtAuthGuard)
  async manualSync(@Param('id') paymentId: string) {
    await this.yookassaService.enqueueSyncJob(paymentId, 'manual');
    return { status: 'queued' };
  }
}
