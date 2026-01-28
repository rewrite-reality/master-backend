import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class DevOnlyGuard implements CanActivate {
  canActivate(_: ExecutionContext) {
    // Разрешаем только не-prod
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev endpoint is disabled in production');
    }
    return true;
  }
}
