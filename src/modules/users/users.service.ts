import {
	Injectable,
	NotFoundException,
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Logger,
} from '@nestjs/common';
import { Prisma, MasterStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
	private readonly logger = new Logger(UsersService.name);

	constructor(private readonly prisma: PrismaService) { }

	/**
	 * Получить текущего пользователя (Safe Response)
	 */
	async getMe(userId: string) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				role: true,
				telegramUsername: true,
				masterProfile: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						patronymic: true,
						phone: true,
						status: true,
						districts: {
							select: {
								district: {
									select: { id: true, name: true, city: true }
								},
							},
						},
					},
				},
			},
		});

		if (!user) {
			this.logger.warn(`User ${userId} not found in getMe`);
			throw new NotFoundException('User not found');
		}

		// Возвращаем безопасную проекцию (без passwordHash и системных полей)
		return {
			id: user.id,
			role: user.role,
			telegramUsername: user.telegramUsername,
			profile: user.masterProfile ? {
				id: user.masterProfile.id,
				firstName: user.masterProfile.firstName,
				lastName: user.masterProfile.lastName,
				patronymic: user.masterProfile.patronymic,
				phone: user.masterProfile.phone,
				status: user.masterProfile.status,
				districts: user.masterProfile.districts.map(d => d.district),
			} : null,
		};
	}

	/**
	 * Создать профиль мастера
	 */
	async createProfile(userId: string, dto: CreateProfileDto) {
		// 1. Дедупликация и защита от null
		const uniqueDistrictIds = dto.districtIds
			? Array.from(new Set(dto.districtIds))
			: [];

		// 2. Валидация районов (если есть)
		if (uniqueDistrictIds.length > 0) {
			const districtsCount = await this.prisma.district.count({
				where: { id: { in: uniqueDistrictIds } },
			});

			if (districtsCount !== uniqueDistrictIds.length) {
				throw new BadRequestException('Invalid district IDs');
			}
		}

		try {
			// 3. Создание (атомарно, полагаемся на constraint базы для защиты от дублей)
			const profile = await this.prisma.masterProfile.create({
				data: {
					userId,
					firstName: dto.firstName,
					lastName: dto.lastName,
					// Нормализация: пустая строка -> null
					patronymic: dto.patronymic ? dto.patronymic : null,
					phone: dto.phone,
					status: MasterStatus.PENDING,

					...(uniqueDistrictIds.length > 0 ? {
						districts: {
							create: uniqueDistrictIds.map((districtId) => ({
								districtId,
							})),
						},
					} : {}),
				},
				include: {
					districts: { include: { district: true } },
				},
			});

			this.logger.log(`Created MasterProfile for user ${userId}`);
			return profile;

		} catch (error) {
			// Ловим ошибку уникальности (P2002), если профиль уже есть (race condition)
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
				throw new ConflictException('Profile already exists');
			}
			throw error;
		}
	}

	/**
	 * Обновить профиль мастера
	 */
	async updateProfile(userId: string, dto: UpdateProfileDto) {
		// Collect only provided fields (avoid undefined writes)
		const dataToUpdate: Prisma.MasterProfileUpdateInput = {};
		if (dto.firstName !== undefined) dataToUpdate.firstName = dto.firstName;
		if (dto.lastName !== undefined) dataToUpdate.lastName = dto.lastName;
		if (dto.phone !== undefined) dataToUpdate.phone = dto.phone;
		// patronymic: null for empty string, skip when undefined
		if (dto.patronymic !== undefined) {
			dataToUpdate.patronymic = dto.patronymic ? dto.patronymic : null;
		}

		return this.prisma.$transaction(async (tx) => {
			const profile = await tx.masterProfile.findUnique({
				where: { userId },
				select: { id: true, status: true },
			});

			if (!profile) {
				this.logger.warn(`Profile for user ${userId} not found in updateProfile`);
				throw new NotFoundException('Profile not found');
			}

			const ensureNotBlocked = async () => {
				const current = await tx.masterProfile.findUnique({
					where: { id: profile.id },
					select: { status: true },
				});

				if (!current) {
					this.logger.warn(`Profile for user ${userId} disappeared during updateProfile`);
					throw new NotFoundException('Profile not found');
				}

				if (current.status === MasterStatus.BLOCKED) {
					this.logger.warn(`Blocked account update attempt for user ${userId}`);
					throw new ForbiddenException('Account blocked');
				}
			};

			await ensureNotBlocked();

			// 1. Update districts if provided (with validation)
			if (dto.districtIds !== undefined) {
				const uniqueDistrictIds = Array.from(new Set(dto.districtIds));

				if (uniqueDistrictIds.length > 0) {
					const count = await tx.district.count({ where: { id: { in: uniqueDistrictIds } } });
					if (count !== uniqueDistrictIds.length) {
						this.logger.warn(`Invalid districts provided by user ${userId} in updateProfile`);
						throw new BadRequestException('Invalid district IDs');
					}
				}

				await ensureNotBlocked();
				await tx.masterDistrict.deleteMany({ where: { masterId: profile.id } });

				if (uniqueDistrictIds.length > 0) {
					await tx.masterDistrict.createMany({
						data: uniqueDistrictIds.map(id => ({ masterId: profile.id, districtId: id })),
						skipDuplicates: true,
					});
				}
			}

			// 2. Update profile scalar fields when provided
			if (Object.keys(dataToUpdate).length > 0) {
				await ensureNotBlocked();
				const updated = await tx.masterProfile.update({
					where: { id: profile.id },
					data: dataToUpdate,
					include: { districts: { include: { district: true } } },
				});

				this.logger.log(`Updated MasterProfile for user ${userId}`);
				return updated;
			}

			const currentProfile = await tx.masterProfile.findUniqueOrThrow({
				where: { id: profile.id },
				include: { districts: { include: { district: true } } },
			});

			this.logger.log(`Updated MasterProfile for user ${userId}`);
			return currentProfile;
		});
	}

}
