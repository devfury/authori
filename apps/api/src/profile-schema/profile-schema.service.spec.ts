import { ProfileSchemaService } from './profile-schema.service';
import { SchemaStatus } from '../database/entities';

describe('ProfileSchemaService', () => {
  const tenantId = 'tenant-1';

  let service: ProfileSchemaService;
  let schemaRepo: {
    findOne: jest.Mock;
  };

  beforeEach(() => {
    schemaRepo = {
      findOne: jest.fn(),
    };

    service = new ProfileSchemaService(schemaRepo as never, {} as never);
  });

  it('finds the latest published schema as the active schema', async () => {
    const activeSchema = {
      id: 'schema-2',
      tenantId,
      version: 2,
      schemaJsonb: {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
        },
        'x-order': ['name'],
      },
      status: SchemaStatus.PUBLISHED,
      publishedBy: 'admin-1',
      createdAt: new Date('2026-04-19T00:00:00.000Z'),
    };
    schemaRepo.findOne.mockResolvedValue(activeSchema);

    const result = await service.findActive(tenantId);

    expect(schemaRepo.findOne).toHaveBeenCalledWith({
      where: { tenantId, status: SchemaStatus.PUBLISHED },
      order: { version: 'DESC' },
    });
    expect(result).toBe(activeSchema);
  });

  it('returns null when the tenant has no published schema', async () => {
    schemaRepo.findOne.mockResolvedValue(null);

    await expect(service.findActive(tenantId)).resolves.toBeNull();
  });
});
