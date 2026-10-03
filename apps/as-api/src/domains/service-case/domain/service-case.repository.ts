import type { NewServiceCase, ServiceCase } from './service-case.js';

export interface ServiceCaseRepository {
  /**
   * `id`(UUIDv7)와 접수 번호(`publicId`)를 발급해 저장하고, 발급된 값이 채워진 접수를 돌려준다.
   * 접수 번호 발급과 저장이 같은 트랜잭션이어야 번호가 겹치지 않으므로 usecase 가 연 `run` 안에서 부른다.
   */
  insert(draft: NewServiceCase): Promise<ServiceCase>;
  /** 최근 접수부터 `limit` 건. */
  findRecent(limit: number): Promise<ServiceCase[]>;
  findById(id: string): Promise<ServiceCase | undefined>;
  /** 행 잠금(`FOR UPDATE`)을 걸고 읽는다. 상태를 바꾸기 전에 쓴다. */
  findByIdForUpdate(id: string): Promise<ServiceCase | undefined>;
  save(serviceCase: ServiceCase): Promise<void>;
}
export const ServiceCaseRepository = Symbol('ServiceCaseRepository');
