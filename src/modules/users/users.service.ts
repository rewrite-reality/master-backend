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
						specialties: {
							select: {
								specialty: {
									select: { id: true, name: true }
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
				specialties: user.masterProfile.specialties.map(s => s.specialty),
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
		const patronymic = typeof dto.patronymic === 'string' ? dto.patronymic.trim() : '';

		// 2. Валидация районов (если есть)
		if (uniqueDistrictIds.length > 0) {
			const districtsCount = await this.prisma.district.count({
				where: { id: { in: uniqueDistrictIds } },
			});

			if (districtsCount !== uniqueDistrictIds.length) {
				throw new BadRequestException('Invalid district IDs');
			}
		}

		// 2.1. Валидация специальностей
		const uniqueSpecialtyIds = dto.specialtyIds
			? Array.from(new Set(dto.specialtyIds))
			: [];

		if (uniqueSpecialtyIds.length > 0) {
			const specialtiesCount = await this.prisma.specialty.count({
				where: { id: { in: uniqueSpecialtyIds } },
			});

			if (specialtiesCount !== uniqueSpecialtyIds.length) {
				throw new BadRequestException('Invalid specialty IDs');
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
					patronymic: patronymic === '' ? null : patronymic,
					phone: dto.phone,
					status: MasterStatus.PENDING,

					...(uniqueDistrictIds.length > 0 ? {
						districts: {
							create: uniqueDistrictIds.map((districtId) => ({
								districtId,
							})),
						},
					} : {}),

					...(uniqueSpecialtyIds.length > 0 ? {
						specialties: {
							create: uniqueSpecialtyIds.map((specialtyId) => ({
								specialtyId,
							})),
						},
					} : {}),
				},
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
								select: { id: true, name: true, city: true },
							},
						},
					},
					specialties: {
						select: {
							specialty: {
								select: { id: true, name: true },
							},
						},
					},
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
		const dataToUpdate: Prisma.MasterProfileUpdateManyMutationInput = {};
		if (dto.firstName !== undefined) dataToUpdate.firstName = dto.firstName;
		if (dto.lastName !== undefined) dataToUpdate.lastName = dto.lastName;
		if (dto.phone !== undefined) dataToUpdate.phone = dto.phone;
		if (dto.patronymic !== undefined) {
			const patronymicValue = typeof dto.patronymic === 'string' ? dto.patronymic.trim() : '';
			dataToUpdate.patronymic = patronymicValue === '' ? null : patronymicValue;
		}

		const hasProfileDataUpdates = Object.keys(dataToUpdate).length > 0;
		const hasDistrictUpdate = dto.districtIds !== undefined;
		const uniqueDistrictIds = hasDistrictUpdate
			? Array.from(new Set(dto.districtIds))
			: [];

		const hasSpecialtyUpdate = dto.specialtyIds !== undefined;
		const uniqueSpecialtyIds = hasSpecialtyUpdate
			? Array.from(new Set(dto.specialtyIds))
			: [];

		if (!hasProfileDataUpdates && !hasDistrictUpdate && !hasSpecialtyUpdate) {
			this.logger.warn('updateProfile bad request: nothing to update');
			throw new BadRequestException('Nothing to update');
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

			if (profile.status === MasterStatus.BLOCKED) {
				this.logger.warn('updateProfile forbidden: profile blocked');
				throw new ForbiddenException('Account blocked');
			}

			if (hasDistrictUpdate && uniqueDistrictIds.length > 0) {
				const districtsCount = await tx.district.count({
					where: { id: { in: uniqueDistrictIds } },
				});

				if (districtsCount !== uniqueDistrictIds.length) {
					this.logger.warn('updateProfile bad request: invalid district ids');
					throw new BadRequestException('Invalid district IDs');
				}
			}

			if (hasSpecialtyUpdate && uniqueSpecialtyIds.length > 0) {
				const specialtiesCount = await tx.specialty.count({
					where: { id: { in: uniqueSpecialtyIds } },
				});

				if (specialtiesCount !== uniqueSpecialtyIds.length) {
					this.logger.warn('updateProfile bad request: invalid specialty ids');
					throw new BadRequestException('Invalid specialty IDs');
				}
			}

			let profileUpdated = false;

			if (hasProfileDataUpdates) {
				const updateResult = await tx.masterProfile.updateMany({
					where: { id: profile.id, status: { not: MasterStatus.BLOCKED } },
					data: dataToUpdate,
				});

				if (updateResult.count === 0) {
					this.logger.warn('updateProfile forbidden: profile blocked');
					throw new ForbiddenException('Account blocked');
				}

				profileUpdated = true;
			} else {
				// Guard to ensure profile not blocked before district rewrite
				const guardResult = await tx.masterProfile.updateMany({
					where: { id: profile.id, status: { not: MasterStatus.BLOCKED } },
					data: { balance: { increment: 0 } },
				});

				if (guardResult.count === 0) {
					this.logger.warn('updateProfile forbidden: profile blocked');
					throw new ForbiddenException('Account blocked');
				}
			}

			if (hasDistrictUpdate) {
				await tx.masterDistrict.deleteMany({ where: { masterId: profile.id } });

				if (uniqueDistrictIds.length > 0) {
					await tx.masterDistrict.createMany({
						data: uniqueDistrictIds.map((districtId) => ({
							masterId: profile.id,
							districtId,
						})),
					});
				}

				profileUpdated = true;
			}

			if (hasSpecialtyUpdate) {
				await tx.masterSpecialty.deleteMany({ where: { masterId: profile.id } });

				if (uniqueSpecialtyIds.length > 0) {
					await tx.masterSpecialty.createMany({
						data: uniqueSpecialtyIds.map((specialtyId) => ({
							masterId: profile.id,
							specialtyId,
						})),
					});
				}

				profileUpdated = true;
			}

			const updatedProfile = await tx.masterProfile.findUniqueOrThrow({
				where: { id: profile.id },
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
								select: { id: true, name: true, city: true },
							},
						},
					},
					specialties: {
						select: {
							specialty: {
								select: { id: true, name: true },
							},
						},
					},
				},
			});

			if (profileUpdated) {
				this.logger.log(`Updated MasterProfile for user ${userId}`);
			}

			return updatedProfile;
		});
	}

}
