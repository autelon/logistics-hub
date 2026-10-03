import { Inject, Injectable } from '@nestjs/common';

import {
  applyPolicyPatch,
  isSamePolicy,
  resolvePolicy,
  type LocationPolicy,
  type LocationPolicyChange,
  type LocationPolicyPatch,
} from '../domain/location-policy.js';
import { LocationPolicyRepository } from '../domain/location-policy.repository.js';

/** 이력으로 돌려주는 최대 건수. */
const CHANGES_LIMIT = 50;

/**
 * 거점 능력 프로필의 조회와 변경. 행이 없는 거점은 기본값으로 동작하므로 조회는 언제나 값을 돌려준다.
 * 거점 해석(코드 → id)은 CatalogService 몫이라 여기서는 id 만 받는다.
 */
@Injectable()
export class LocationPolicyService {
  constructor(
    @Inject(LocationPolicyRepository) private readonly policies: LocationPolicyRepository,
  ) {}

  async policyOf(locationId: string): Promise<LocationPolicy> {
    return resolvePolicy(await this.policies.find(locationId));
  }

  /** 거점 id → 유효한 프로필. 행이 없는 거점은 들어 있지 않으므로 꺼낼 때 resolvePolicy 로 채운다. */
  async policiesByLocation(): Promise<Map<string, LocationPolicy>> {
    const stored = await this.policies.listAll();
    return new Map(stored.map((policy) => [policy.locationId, resolvePolicy(policy)]));
  }

  /**
   * 보낸 항목만 바꾸고 유효한 프로필을 돌려준다. 바뀌는 것이 없으면 아무것도 쓰지 않는다
   * (이력에 변화 없는 줄이 쌓이지 않게).
   *
   * 트랜잭션 안에서, 트랜잭션의 첫 쿼리로 거점 행을 잠근 뒤(`CatalogService.lockLocationByCode`) 부른다.
   * 그래야 같은 거점의 동시 변경이 줄을 서고, 잠금을 얻은 뒤에 처음 읽는 이 조회가 앞선 변경을 본다.
   */
  async update(
    locationId: string,
    patch: LocationPolicyPatch,
    actor: string,
    now: Date = new Date(),
  ): Promise<LocationPolicy> {
    const before = resolvePolicy(await this.policies.find(locationId));
    const after = applyPolicyPatch(before, patch);
    if (isSamePolicy(before, after)) return before;

    await this.policies.save({ ...after, locationId, updatedAt: now, updatedBy: actor });
    await this.policies.addChange({ locationId, actor, changedAt: now, before, after });
    return after;
  }

  /**
   * 최신순, 최대 50건. 이력의 JSON 은 항목이 늘기 전에 쓰였을 수 있어, 읽을 때 기본값으로 채운다
   * (이때 키 순서도 정해진다. MySQL 의 JSON 은 키 순서를 보존하지 않는다).
   */
  async listChanges(locationId: string): Promise<LocationPolicyChange[]> {
    const changes = await this.policies.listChanges(locationId, CHANGES_LIMIT);
    return changes.map((change) => ({
      ...change,
      before: resolvePolicy(change.before),
      after: resolvePolicy(change.after),
    }));
  }
}
