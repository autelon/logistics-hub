import { describe, expect, it } from 'vitest';

import { setupMemory } from '../../../testing/memory-repositories.js';

const items = (serials: string[]) =>
  serials.map((serialNumber, i) => ({ unitId: `U${i}`, serialNumber, sku: 'CAM-01' }));

const setup = async (serials = ['S1', 'S2', 'S3']) => {
  const memory = setupMemory();
  const request = await memory.deviceRequests.create({
    type: 'REGISTER',
    reason: 'REGISTRATION',
    createdBy: 'op-1',
    items: items(serials),
  });
  return { ...memory, request };
};

describe('DeviceRequestService', () => {
  describe('notify', () => {
    it('기기 서버에 requestId, 종류, 건수만 알리고 알림 시각을 적는다', async () => {
      const { deviceRequests, deviceServer, deviceRequestRepository, request } = await setup();

      const result = await deviceRequests.notify({
        requestId: request.id,
        type: 'REGISTER',
        count: 3,
      });

      expect(result).toBe('notified');
      expect(deviceServer.notifications).toEqual([
        { requestId: request.id, type: 'REGISTER', count: 3 },
      ]);
      expect(deviceRequestRepository.requests[0]?.notifiedAt).toBeInstanceOf(Date);
    });

    it('기기 서버가 실패하면 던지고 알림 시각을 적지 않는다 (메시지가 다시 시도된다)', async () => {
      const { deviceRequests, deviceServer, deviceRequestRepository, request } = await setup();
      deviceServer.down = true;

      await expect(
        deviceRequests.notify({ requestId: request.id, type: 'REGISTER', count: 3 }),
      ).rejects.toThrow('device server is down');
      expect(deviceRequestRepository.requests[0]?.notifiedAt).toBeNull();

      deviceServer.down = false;
      expect(
        await deviceRequests.notify({ requestId: request.id, type: 'REGISTER', count: 3 }),
      ).toBe('notified');
    });

    it('이미 알렸으면 다시 알리지 않는다 (같은 메시지가 두 번 와도 한 번만)', async () => {
      const { deviceRequests, deviceServer, request } = await setup();
      const notification = { requestId: request.id, type: 'REGISTER' as const, count: 3 };

      await deviceRequests.notify(notification);
      expect(await deviceRequests.notify(notification)).toBe('already-notified');

      expect(deviceServer.notifications).toHaveLength(1);
    });

    it('모르는 요청이면 알리지 않는다', async () => {
      const { deviceRequests, deviceServer } = await setup();

      expect(await deviceRequests.notify({ requestId: 'nope', type: 'REGISTER', count: 1 })).toBe(
        'unknown-request',
      );
      expect(deviceServer.notifications).toHaveLength(0);
    });
  });

  describe('unitsPage', () => {
    it('항목 id 순서의 커서로 나눠서 가져가고 마지막 페이지의 nextCursor 는 null', async () => {
      const { deviceRequests, request } = await setup(['S1', 'S2', 'S3', 'S4', 'S5']);

      const first = await deviceRequests.unitsPage(request.id, undefined, 2);
      expect(first.items.map((i) => i.serialNumber)).toEqual(['S1', 'S2']);
      expect(first.nextCursor).not.toBeNull();

      const second = await deviceRequests.unitsPage(request.id, first.nextCursor ?? undefined, 2);
      expect(second.items.map((i) => i.serialNumber)).toEqual(['S3', 'S4']);

      const third = await deviceRequests.unitsPage(request.id, second.nextCursor ?? undefined, 2);
      expect(third.items.map((i) => i.serialNumber)).toEqual(['S5']);
      expect(third.nextCursor).toBeNull();
    });

    it('정확히 한 페이지로 끝나면 nextCursor 는 null', async () => {
      const { deviceRequests, request } = await setup(['S1', 'S2']);

      const page = await deviceRequests.unitsPage(request.id, undefined, 2);

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
    });

    it('같은 커서로 다시 가져가면 같은 페이지다', async () => {
      const { deviceRequests, request } = await setup(['S1', 'S2', 'S3']);
      const first = await deviceRequests.unitsPage(request.id, undefined, 1);

      const a = await deviceRequests.unitsPage(request.id, first.nextCursor ?? undefined, 1);
      const b = await deviceRequests.unitsPage(request.id, first.nextCursor ?? undefined, 1);

      expect(a).toEqual(b);
    });

    it('없는 요청이면 DEVICE_REQUEST_NOT_FOUND', async () => {
      const { deviceRequests } = await setup();

      await expect(deviceRequests.unitsPage('nope', undefined, 10)).rejects.toMatchObject({
        code: 'DEVICE_REQUEST_NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('recordResults', () => {
    it('시리얼별 결과를 기록하고 상태가 진행에 따라 바뀐다', async () => {
      const { deviceRequests, request } = await setup();
      const status = async () => (await deviceRequests.get(request.id)).summary.status;

      expect(await status()).toBe('NOT_NOTIFIED');
      await deviceRequests.notify({ requestId: request.id, type: 'REGISTER', count: 3 });
      expect(await status()).toBe('NOTIFIED');

      await deviceRequests.recordResults(request.id, [
        { serialNumber: 'S1', result: 'SUCCEEDED', reason: null },
      ]);
      expect(await status()).toBe('IN_PROGRESS');

      await deviceRequests.recordResults(request.id, [
        { serialNumber: 'S2', result: 'SUCCEEDED', reason: null },
        { serialNumber: 'S3', result: 'FAILED', reason: '기기 데이터 생성 실패' },
      ]);
      const { summary, failedItems } = await deviceRequests.get(request.id);
      expect(summary.status).toBe('PARTIALLY_FAILED');
      expect(summary.counts).toEqual({ total: 3, pending: 0, succeeded: 2, failed: 1 });
      expect(failedItems.map((i) => [i.serialNumber, i.resultReason])).toEqual([
        ['S3', '기기 데이터 생성 실패'],
      ]);
    });

    it('같은 시리얼의 결과는 마지막 값이 이긴다', async () => {
      const { deviceRequests, request } = await setup(['S1']);

      await deviceRequests.recordResults(request.id, [
        { serialNumber: 'S1', result: 'FAILED', reason: 'x' },
      ]);
      expect((await deviceRequests.get(request.id)).summary.status).toBe('PARTIALLY_FAILED');

      await deviceRequests.recordResults(request.id, [
        { serialNumber: 'S1', result: 'SUCCEEDED', reason: null },
      ]);
      const { summary, failedItems } = await deviceRequests.get(request.id);
      expect(summary.status).toBe('COMPLETED');
      expect(failedItems).toEqual([]);
    });

    it('한 번의 보고 안에서 같은 시리얼이 둘이면 뒤의 것이 이긴다', async () => {
      const { deviceRequests, request } = await setup(['S1']);

      await deviceRequests.recordResults(request.id, [
        { serialNumber: 'S1', result: 'FAILED', reason: 'x' },
        { serialNumber: 'S1', result: 'SUCCEEDED', reason: null },
      ]);

      expect((await deviceRequests.get(request.id)).summary.status).toBe('COMPLETED');
    });

    it('요청에 없는 시리얼이 있으면 422 DEVICE_REQUEST_UNKNOWN_SERIAL 이고 아무것도 기록하지 않는다', async () => {
      const { deviceRequests, deviceRequestRepository, request } = await setup(['S1', 'S2']);

      await expect(
        deviceRequests.recordResults(request.id, [
          { serialNumber: 'S1', result: 'SUCCEEDED', reason: null },
          { serialNumber: 'GHOST', result: 'SUCCEEDED', reason: null },
        ]),
      ).rejects.toMatchObject({
        code: 'DEVICE_REQUEST_UNKNOWN_SERIAL',
        status: 422,
        details: { serialNumbers: ['GHOST'] },
      });
      expect(deviceRequestRepository.items.every((i) => i.result === 'PENDING')).toBe(true);
    });

    it('없는 요청이면 DEVICE_REQUEST_NOT_FOUND', async () => {
      const { deviceRequests } = await setup();

      await expect(
        deviceRequests.recordResults('nope', [
          { serialNumber: 'S1', result: 'SUCCEEDED', reason: null },
        ]),
      ).rejects.toMatchObject({ code: 'DEVICE_REQUEST_NOT_FOUND', status: 404 });
    });
  });
});
