import type { DeviceRequestView } from '@repo/contracts/scm';

import type { DeviceRequestSummary } from '../domains/device-request/domain/device-request.js';

export const toDeviceRequestView = ({
  request,
  counts,
  status,
}: DeviceRequestSummary): DeviceRequestView => ({
  id: request.id,
  type: request.type,
  reason: request.reason,
  createdBy: request.createdBy,
  createdAt: request.createdAt.toISOString(),
  notifiedAt: request.notifiedAt?.toISOString() ?? null,
  status,
  counts,
});
