import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { TenantRole } from './tenant-role.entity';
import { TenantPermission } from './tenant-permission.entity';

@Entity('role_permissions')
export class RolePermission {
  @PrimaryColumn({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @PrimaryColumn({ name: 'permission_id', type: 'uuid' })
  permissionId: string;

  @ManyToOne(() => TenantRole, (role) => role.rolePermissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'role_id' })
  role: TenantRole;

  @ManyToOne(
    () => TenantPermission,
    (permission) => permission.rolePermissions,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'permission_id' })
  permission: TenantPermission;
}
