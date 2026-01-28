import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DevAuthController } from './dev-auth.controller';
import { DevAuthService } from './dev-auth.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [DevAuthController],
  providers: [DevAuthService],
})
export class DevModule {}
