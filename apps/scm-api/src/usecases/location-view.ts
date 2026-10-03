import type { LocationPolicyChangeView, LocationView } from '@repo/contracts/scm';

import type { Location } from '../domains/catalog/domain/catalog.js';
import type {
  LocationPolicy,
  LocationPolicyChange,
} from '../domains/catalog/domain/location-policy.js';

export const toLocationView = (
  { code, name, type, partner }: Location,
  policy: LocationPolicy,
): LocationView => ({ code, name, type, partner, policy });

export const toLocationPolicyChangeView = ({
  id,
  actor,
  changedAt,
  before,
  after,
}: LocationPolicyChange): LocationPolicyChangeView => ({
  id,
  actor,
  changedAt: changedAt.toISOString(),
  before,
  after,
});
