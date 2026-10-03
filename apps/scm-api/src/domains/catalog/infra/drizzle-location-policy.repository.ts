import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import { newId } from '@repo/db-kit/columns';
import { CurrentDb } from '@repo/nest-kit/current-db';

import type * as schema from '../../../db/schema.js';
import { locationPolicies, locationPolicyChanges } from '../../../db/schema.js';
import type {
  LocationPolicyChange,
  NewLocationPolicyChange,
  StoredLocationPolicy,
} from '../domain/location-policy.js';
import type { LocationPolicyRepository } from '../domain/location-policy.repository.js';

type PolicyRow = typeof locationPolicies.$inferSelect;

const toStored = (row: PolicyRow): StoredLocationPolicy => ({
  locationId: row.locationId,
  reportsSerialsOnReceipt: row.reportsSerialsOnReceipt,
  reportsSerialsOnShipment: row.reportsSerialsOnShipment,
  reportsSerialsOnOutbound: row.reportsSerialsOnOutbound,
  reportsInspectionResult: row.reportsInspectionResult,
  decidesDisposition: row.decidesDisposition,
  requiresHubConfirmation: row.requiresHubConfirmation,
  unitReceiptTrigger: row.unitReceiptTrigger,
  autoRegisterOnPutaway: row.autoRegisterOnPutaway,
  updatedAt: row.updatedAt,
  updatedBy: row.updatedBy,
});

@Injectable()
export class DrizzleLocationPolicyRepository implements LocationPolicyRepository {
  constructor(@Inject(CurrentDb) private readonly db: CurrentDb<typeof schema>) {}

  async listAll(): Promise<StoredLocationPolicy[]> {
    const rows = await this.db.get().select().from(locationPolicies);
    return rows.map(toStored);
  }

  async find(locationId: string): Promise<StoredLocationPolicy | undefined> {
    const [row] = await this.db
      .get()
      .select()
      .from(locationPolicies)
      .where(eq(locationPolicies.locationId, locationId))
      .limit(1);
    return row && toStored(row);
  }

  async save({ locationId, ...values }: StoredLocationPolicy): Promise<void> {
    await this.db
      .get()
      .insert(locationPolicies)
      .values({ id: newId(), locationId, ...values })
      .onDuplicateKeyUpdate({ set: values });
  }

  async addChange(change: NewLocationPolicyChange): Promise<void> {
    await this.db
      .get()
      .insert(locationPolicyChanges)
      .values({ id: newId(), ...change });
  }

  async listChanges(locationId: string, limit: number): Promise<LocationPolicyChange[]> {
    // id 는 UUIDv7 이라 같은 밀리초의 변경도 만든 순서대로 정렬된다.
    return this.db
      .get()
      .select()
      .from(locationPolicyChanges)
      .where(eq(locationPolicyChanges.locationId, locationId))
      .orderBy(desc(locationPolicyChanges.changedAt), desc(locationPolicyChanges.id))
      .limit(limit);
  }
}
