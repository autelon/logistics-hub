import type {
  LocationPolicyChange,
  NewLocationPolicyChange,
  StoredLocationPolicy,
} from './location-policy.js';

export interface LocationPolicyRepository {
  /** 저장된 프로필 전부. 행이 없는 거점은 나오지 않는다. */
  listAll(): Promise<StoredLocationPolicy[]>;
  find(locationId: string): Promise<StoredLocationPolicy | undefined>;
  /** 거점당 한 행. 없으면 만들고 있으면 모든 값을 덮어쓴다. */
  save(policy: StoredLocationPolicy): Promise<void>;
  addChange(change: NewLocationPolicyChange): Promise<void>;
  /** 최신순. */
  listChanges(locationId: string, limit: number): Promise<LocationPolicyChange[]>;
}
export const LocationPolicyRepository = Symbol('LocationPolicyRepository');
