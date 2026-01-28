import { Injectable } from '@nestjs/common';
import { MasterStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(startOfToday);
    startOfMonth.setDate(1);

    const [totalOrders, activeMasters, revenueToday, revenueMonth] =
      await Promise.all([
        this.prisma.order.count(),
        this.prisma.masterProfile.count({
          where: { status: MasterStatus.ACTIVE },
        }),
        this.prisma.order.aggregate({
          _sum: { price: true },
          where: {
            status: OrderStatus.COMPLETED,
            createdAt: { gte: startOfToday },
          },
        }),
        this.prisma.order.aggregate({
          _sum: { price: true },
          where: {
            status: OrderStatus.COMPLETED,
            createdAt: { gte: startOfMonth },
          },
        }),
      ]);

    return {
      totalOrders,
      revenueToday: revenueToday._sum.price
        ? new Prisma.Decimal(revenueToday._sum.price).toNumber()
        : 0,
      revenueMonth: revenueMonth._sum.price
        ? new Prisma.Decimal(revenueMonth._sum.price).toNumber()
        : 0,
      activeMasters,
    };
  }
}
