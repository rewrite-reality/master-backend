import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { YookassaService } from './yookassa.service';

@Controller('integrations/yookassa')
export class YookassaController {
  constructor(private readonly yookassaService: YookassaService) {}

  @Post('create-payment')
  @UseGuards(JwtAuthGuard)
  async createPayment(
    @CurrentUser() user: { id: string },
    @Body() dto: CreatePaymentDto,
  ) {
    return this.yookassaService.createDebtPayment(user.id, dto.amount);
  }

  @Post('webhook')
  async webhook(@Body() event: any) {
    return this.yookassaService.handleWebhook(event);
  }
}
