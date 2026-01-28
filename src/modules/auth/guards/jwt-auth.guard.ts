import {
	Injectable,
	ExecutionContext,
	UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Глобальный Guard для проверки JWT токена.
 * Используется как @UseGuards(JwtAuthGuard)
 *
 * Если токен невалиден или отсутствует, выбрасывает 401 Unauthorized.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
	/**
	 * Можно переопределить метод handleRequest, чтобы кастомизировать ошибку
	 * или поведение (например, сделать опциональную авторизацию).
	 */
	handleRequest(err: any, user: any, info: any) {
		// info содержит причину ошибки от passport-jwt (например, "jwt expired")

		if (err || !user) {
			// Если есть конкретная ошибка jwt (истек, неверная подпись) — прокидываем её сообщение
			// Но для безопасности продакшена лучше не раскрывать детали, а просто писать "Unauthorized"

			// Логируем для отладки, если нужно (но тут нет Logger по дефолту, можно добавить)

			throw err || new UnauthorizedException('Unauthorized');
		}

		return user;
	}
}
