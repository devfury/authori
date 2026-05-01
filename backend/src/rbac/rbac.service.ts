import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  RolePermission,
  TenantPermission,
  TenantRole,
  User,
  UserRole,
} from '../database/entities';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(TenantRole)
    private readonly roleRepo: Repository<TenantRole>,
    @InjectRepository(TenantPermission)
    private readonly permissionRepo: Repository<TenantPermission>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findRoles(tenantId: string): Promise<TenantRole[]> {
    return this.roleRepo.find({
      where: { tenantId },
      order: { name: 'ASC' },
      relations: ['rolePermissions', 'rolePermissions.permission'],
    });
  }

  async findRole(tenantId: string, id: string): Promise<TenantRole> {
    const role = await this.roleRepo.findOne({
      where: { tenantId, id },
      relations: ['rolePermissions', 'rolePermissions.permission'],
    });
    if (!role) throw new NotFoundException('role_not_found');
    return role;
  }

  async createRole(tenantId: string, dto: CreateRoleDto): Promise<TenantRole> {
    const exists = await this.roleRepo.findOne({
      where: { tenantId, name: dto.name },
      select: ['id'],
    });
    if (exists) throw new BadRequestException('role_already_exists');

    return this.roleRepo.save(
      this.roleRepo.create({
        tenantId,
        ...dto,
        description: dto.description ?? null,
      }),
    );
  }

  async updateRole(
    tenantId: string,
    id: string,
    dto: UpdateRoleDto,
  ): Promise<TenantRole> {
    const role = await this.findRole(tenantId, id);
    if (dto.displayName !== undefined) role.displayName = dto.displayName;
    if (dto.description !== undefined)
      role.description = dto.description ?? null;
    return this.roleRepo.save(role);
  }

  async removeRole(tenantId: string, id: string): Promise<void> {
    const role = await this.findRole(tenantId, id);
    await this.roleRepo.remove(role);
  }

  async findPermissions(tenantId: string): Promise<TenantPermission[]> {
    return this.permissionRepo.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
  }

  async findPermission(
    tenantId: string,
    id: string,
  ): Promise<TenantPermission> {
    const permission = await this.permissionRepo.findOne({
      where: { tenantId, id },
    });
    if (!permission) throw new NotFoundException('permission_not_found');
    return permission;
  }

  async createPermission(
    tenantId: string,
    dto: CreatePermissionDto,
  ): Promise<TenantPermission> {
    const exists = await this.permissionRepo.findOne({
      where: { tenantId, name: dto.name },
      select: ['id'],
    });
    if (exists) throw new BadRequestException('permission_already_exists');

    return this.permissionRepo.save(
      this.permissionRepo.create({
        tenantId,
        ...dto,
        description: dto.description ?? null,
      }),
    );
  }

  async updatePermission(
    tenantId: string,
    id: string,
    dto: UpdatePermissionDto,
  ): Promise<TenantPermission> {
    const permission = await this.findPermission(tenantId, id);
    if (dto.displayName !== undefined) permission.displayName = dto.displayName;
    if (dto.description !== undefined) {
      permission.description = dto.description ?? null;
    }
    return this.permissionRepo.save(permission);
  }

  async removePermission(tenantId: string, id: string): Promise<void> {
    const permission = await this.findPermission(tenantId, id);
    await this.permissionRepo.remove(permission);
  }

  async setRolePermissions(
    tenantId: string,
    roleId: string,
    permissionIds: string[],
  ): Promise<TenantRole> {
    await this.findRole(tenantId, roleId);
    await this.assertPermissionsBelongToTenant(tenantId, permissionIds);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(RolePermission, { roleId });
      if (permissionIds.length > 0) {
        await manager.save(
          RolePermission,
          permissionIds.map((permissionId) =>
            manager.create(RolePermission, { roleId, permissionId }),
          ),
        );
      }
    });

    return this.findRole(tenantId, roleId);
  }

  async findUserRoles(tenantId: string, userId: string): Promise<TenantRole[]> {
    await this.assertUserBelongsToTenant(tenantId, userId);

    return this.roleRepo
      .createQueryBuilder('role')
      .innerJoin(UserRole, 'userRole', '"userRole"."role_id" = "role"."id"')
      .leftJoinAndSelect('role.rolePermissions', 'rolePermission')
      .leftJoinAndSelect('rolePermission.permission', 'permission')
      .where('"role"."tenant_id" = :tenantId', { tenantId })
      .andWhere('"userRole"."user_id" = :userId', { userId })
      .orderBy('role.name', 'ASC')
      .getMany();
  }

  async setUserRoles(
    tenantId: string,
    userId: string,
    roleIds: string[],
  ): Promise<TenantRole[]> {
    await this.assertUserBelongsToTenant(tenantId, userId);
    await this.assertRolesBelongToTenant(tenantId, roleIds);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(UserRole, { userId });
      if (roleIds.length > 0) {
        await manager.save(
          UserRole,
          roleIds.map((roleId) => manager.create(UserRole, { userId, roleId })),
        );
      }
    });

    return this.findUserRoles(tenantId, userId);
  }

  async addUserRole(
    tenantId: string,
    userId: string,
    roleId: string,
  ): Promise<TenantRole[]> {
    await this.assertUserBelongsToTenant(tenantId, userId);
    await this.assertRolesBelongToTenant(tenantId, [roleId]);

    await this.userRoleRepo
      .createQueryBuilder()
      .insert()
      .into(UserRole)
      .values({ userId, roleId })
      .orIgnore()
      .execute();

    return this.findUserRoles(tenantId, userId);
  }

  async removeUserRole(
    tenantId: string,
    userId: string,
    roleId: string,
  ): Promise<TenantRole[]> {
    await this.assertUserBelongsToTenant(tenantId, userId);
    await this.assertRolesBelongToTenant(tenantId, [roleId]);

    await this.userRoleRepo.delete({ userId, roleId });
    return this.findUserRoles(tenantId, userId);
  }

  async getUserRoleNames(tenantId: string, userId: string): Promise<string[]> {
    const roles = await this.roleRepo
      .createQueryBuilder('role')
      .innerJoin(UserRole, 'userRole', '"userRole"."role_id" = "role"."id"')
      .where('"role"."tenant_id" = :tenantId', { tenantId })
      .andWhere('"userRole"."user_id" = :userId', { userId })
      .orderBy('role.name', 'ASC')
      .getMany();

    return roles.map((role) => role.name);
  }

  async getUserPermissionNames(
    tenantId: string,
    userId: string,
  ): Promise<string[]> {
    const permissions = await this.permissionRepo
      .createQueryBuilder('permission')
      .innerJoin(
        RolePermission,
        'rolePermission',
        '"rolePermission"."permission_id" = "permission"."id"',
      )
      .innerJoin(
        UserRole,
        'userRole',
        '"userRole"."role_id" = "rolePermission"."role_id"',
      )
      .where('"permission"."tenant_id" = :tenantId', { tenantId })
      .andWhere('"userRole"."user_id" = :userId', { userId })
      .orderBy('permission.name', 'ASC')
      .getMany();

    return Array.from(
      new Set(permissions.map((permission) => permission.name)),
    );
  }

  private async assertUserBelongsToTenant(
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { tenantId, id: userId },
      select: ['id'],
    });
    if (!user) throw new NotFoundException('user_not_found');
  }

  private async assertRolesBelongToTenant(
    tenantId: string,
    roleIds: string[],
  ): Promise<void> {
    const uniqueIds = Array.from(new Set(roleIds));
    if (uniqueIds.length === 0) return;

    const roles = await this.roleRepo.find({
      where: { tenantId, id: In(uniqueIds) },
      select: ['id'],
    });
    if (roles.length !== uniqueIds.length) {
      throw new BadRequestException('invalid_role_ids');
    }
  }

  private async assertPermissionsBelongToTenant(
    tenantId: string,
    permissionIds: string[],
  ): Promise<void> {
    const uniqueIds = Array.from(new Set(permissionIds));
    if (uniqueIds.length === 0) return;

    const permissions = await this.permissionRepo.find({
      where: { tenantId, id: In(uniqueIds) },
      select: ['id'],
    });
    if (permissions.length !== uniqueIds.length) {
      throw new BadRequestException('invalid_permission_ids');
    }
  }
}
