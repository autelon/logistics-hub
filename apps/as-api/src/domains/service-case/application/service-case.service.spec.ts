import 'reflect-metadata';

import { beforeEach, describe, expect, it } from 'vitest';

import { Topics } from '@repo/contracts/common';
import type { EventOutbox } from '@repo/nest-kit/event-outbox';

import type { NewServiceCase, ServiceCase } from '../domain/service-case.js';
import type { ServiceCaseRepository } from '../domain/service-case.repository.js';
import { ServiceCaseService } from './service-case.service.js';

/** DB 없이 흐름(잠금 → 규칙 → 저장 → 아웃박스)을 확인하기 위한 메모리 저장소. */
class MemoryServiceCaseRepository implements ServiceCaseRepository {
  readonly rows = new Map<string, ServiceCase>();
  private seq = 0;

  async insert(draft: NewServiceCase): Promise<ServiceCase> {
    this.seq += 1;
    const saved = { ...draft, id: `case-${this.seq}`, publicId: `CASE-2026-00000${this.seq}` };
    this.rows.set(saved.id, saved);
    return saved;
  }
  async findRecent(limit: number) {
    return [...this.rows.values()].reverse().slice(0, limit);
  }
  async findById(id: string) {
    return this.rows.get(id);
  }
  async findByIdForUpdate(id: string) {
    return this.rows.get(id);
  }
  async save(serviceCase: ServiceCase) {
    this.rows.set(serviceCase.id, serviceCase);
  }
}

class MemoryEventOutbox implements EventOutbox {
  readonly events: { topic: string; key: string; event: unknown }[] = [];
  async enqueue(topic: string, key: string, event: unknown) {
    this.events.push({ topic, key, event });
  }
}

const intake = {
  serialNumber: 'SN-1',
  origin: 'SALES',
  symptom: '전원이 켜지지 않음',
  relatedCaseId: null,
} as const;

let cases: MemoryServiceCaseRepository;
let outbox: MemoryEventOutbox;
let service: ServiceCaseService;

beforeEach(() => {
  cases = new MemoryServiceCaseRepository();
  outbox = new MemoryEventOutbox();
  service = new ServiceCaseService(cases, outbox);
});

describe('ServiceCaseService', () => {
  it('접수하면 OPEN 상태로 저장되고 발급된 id 와 publicId 가 붙는다', async () => {
    const opened = await service.open(intake);
    expect(opened).toMatchObject({
      ...intake,
      id: 'case-1',
      publicId: 'CASE-2026-000001',
      status: 'OPEN',
    });
    expect(await service.get(opened.id)).toEqual(opened);
  });

  it('없는 접수는 CASE_NOT_FOUND', async () => {
    await expect(service.get('nope')).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });
    await expect(service.reject('nope')).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });
  });

  it('DOA 확정은 저장과 함께 as.doa.confirmed 를 아웃박스에 적는다', async () => {
    const opened = await service.open(intake);
    const confirmed = await service.confirmDoa(opened.id, 'SCRAP');

    expect(confirmed).toMatchObject({ status: 'DOA_CONFIRMED', disposition: 'SCRAP' });
    expect(cases.rows.get(opened.id)).toEqual(confirmed);
    expect(outbox.events).toEqual([
      {
        topic: Topics.asCaseEvents,
        key: 'SN-1',
        event: expect.objectContaining({
          type: 'as.doa.confirmed',
          payload: {
            caseId: opened.id,
            serialNumber: 'SN-1',
            origin: 'SALES',
            disposition: 'SCRAP',
            confirmedAt: confirmed.confirmedAt?.toISOString(),
          },
        }),
      },
    ]);
  });

  it('이미 판정이 끝난 접수는 CASE_NOT_OPEN 이고 이벤트를 내지 않는다', async () => {
    const opened = await service.open(intake);
    await service.reject(opened.id);

    await expect(service.confirmDoa(opened.id, 'SCRAP')).rejects.toMatchObject({
      code: 'CASE_NOT_OPEN',
    });
    await expect(service.reject(opened.id)).rejects.toMatchObject({ code: 'CASE_NOT_OPEN' });
    expect(outbox.events).toEqual([]);
  });

  it('폐기는 폐기 처분으로 확정된 접수만 되고 as.unit.scrapped 를 낸다', async () => {
    const opened = await service.open(intake);
    await expect(service.scrap(opened.id)).rejects.toMatchObject({ code: 'CASE_NOT_SCRAPPABLE' });

    await service.confirmDoa(opened.id, 'SCRAP');
    const scrapped = await service.scrap(opened.id);

    expect(scrapped.status).toBe('SCRAPPED');
    expect(outbox.events).toEqual([
      expect.objectContaining({ event: expect.objectContaining({ type: 'as.doa.confirmed' }) }),
      expect.objectContaining({
        key: 'SN-1',
        event: expect.objectContaining({
          type: 'as.unit.scrapped',
          payload: {
            caseId: opened.id,
            serialNumber: 'SN-1',
            scrappedAt: scrapped.scrappedAt?.toISOString(),
          },
        }),
      }),
    ]);
  });
});
