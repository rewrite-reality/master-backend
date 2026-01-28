import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Декоратор для получения текущего авторизованного пользователя из Request.
 * Используется в контроллерах вместе с JwtAuthGuard.
 *
 * Пример:
 * @Get('me')
 * getProfile(@CurrentUser() user: User) { ... }
 *
 * Или для получения конкретного поля:
 * @CurrentUser('id') userId: string
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    // Если юзера нет в запросе (забыли Guard?), возвращаем null или кидаем ошибку (опционально)
    if (!user) {
      return null;
    }

    // Если передали аргумент (например @CurrentUser('id')), возвращаем только это поле
    return data ? user[data] : user;
  },
);
