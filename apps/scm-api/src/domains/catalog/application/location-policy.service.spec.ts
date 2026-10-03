import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCATION_POLICY,
  type LocationPolicyChange,
  type NewLocationPolicyChange,
  type StoredLocationPolicy,
} from '../domain/location-policy.js';
import type { LocationPolicyRepository } from '../domain/location-policy.repository.js';
import { LocationPolicyService } from './location-policy.service.js';

class MemoryLocationPolicyRepository implements LocationPolicyRepository {
  rows = new Map<string, StoredLocationPolicy>();
  changes: LocationPolicyChange[] = [];

  listAll() {
    return Promise.resolve([...this.rows.values()]);
  }
  find(locationId: string) {
    return Promise.resolve(this.rows.get(locationId));
  }
  save(policy: StoredLocationPolicy) {
    this.rows.set(policy.locationId, policy);
    return Promise.resolve();
  }
  addChange(change: NewLocationPolicyChange) {
    this.changes.push({ ...change, id: `C${this.changes.length + 1}` });
    return Promise.resolve();
  }
  listChanges(locationId: string, limit: number) {
    return Promise.resolve(
      this.changes
        .filter((c) => c.locationId === locationId)
        .reverse()
        .slice(0, limit),
    );
  }
}

const setup = () => {
  const repository = new MemoryLocationPolicyRepository();
  return { repository, service: new LocationPolicyService(repository) };
};

describe('LocationPolicyService', () => {
  it('행이 없는 거점은 기본값이고, 조회만으로 행이 생기지 않는다', async () => {
    const { repository, service } = setup();
    expect(await service.policyOf('L1')).toEqual(DEFAULT_LOCATION_POLICY);
    expect(repository.rows.size).toBe(0);
  });

  it('처음 바꾸면 기본값 위에 보낸 항목만 얹어 저장하고 이력을 남긴다', async () => {
    const { repository, service } = setup();
    const at = new Date('2026-10-03T00:00:00Z');

    const after = await service.update('L1', { reportsSerialsOnReceipt: false }, 'kim', at);

    expect(after).toEqual({ ...DEFAULT_LOCATION_POLICY, reportsSerialsOnReceipt: false });
    expect(repository.rows.get('L1')).toEqual({
      ...after,
      locationId: 'L1',
      updatedAt: at,
      updatedBy: 'kim',
    });
    expect(repository.changes).toEqual([
      {
        id: 'C1',
        locationId: 'L1',
        actor: 'kim',
        changedAt: at,
        before: DEFAULT_LOCATION_POLICY,
        after,
      },
    ]);
  });

  it('두 번째 변경은 앞서 바뀐 값을 유지하고 before 에 직전 값을 담는다', async () => {
    const { repository, service } = setup();
    await service.update('L1', { reportsSerialsOnReceipt: false }, 'kim');
    const second = await service.update('L1', { decidesDisposition: true }, 'lee');

    expect(second.reportsSerialsOnReceipt).toBe(false);
    expect(second.decidesDisposition).toBe(true);
    expect(repository.changes[1]?.before.decidesDisposition).toBe(false);
    expect(repository.changes[1]?.before.reportsSerialsOnReceipt).toBe(false);
    expect(repository.rows.get('L1')?.updatedBy).toBe('lee');
  });

  it('바뀌는 것이 없으면 행도 이력도 만들지 않는다', async () => {
    const { repository, service } = setup();
    const result = await service.update('L1', { reportsSerialsOnReceipt: true }, 'kim');

    expect(result).toEqual(DEFAULT_LOCATION_POLICY);
    expect(repository.rows.size).toBe(0);
    expect(repository.changes).toEqual([]);
  });

  it('다른 거점의 프로필과 이력은 섞이지 않는다', async () => {
    const { service } = setup();
    await service.update('L1', { autoRegisterOnPutaway: true }, 'kim');

    expect((await service.policiesByLocation()).get('L1')?.autoRegisterOnPutaway).toBe(true);
    expect((await service.policiesByLocation()).has('L2')).toBe(false);
    expect(await service.listChanges('L2')).toEqual([]);
  });

  it('이력은 최신순이다', async () => {
    const { service } = setup();
    await service.update('L1', { unitReceiptTrigger: 'GOODS_RECEIPT' }, 'kim');
    await service.update('L1', { unitReceiptTrigger: 'PUTAWAY' }, 'lee');

    expect((await service.listChanges('L1')).map((c) => c.actor)).toEqual(['lee', 'kim']);
  });
});
