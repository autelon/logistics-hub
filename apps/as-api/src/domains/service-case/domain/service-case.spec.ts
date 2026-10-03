import { describe, expect, it } from 'vitest';

import { confirmDoa, openCase, reject, scrap, type ServiceCase } from './service-case.js';

const openedAt = new Date('2026-10-01T00:00:00.000Z');
const at = new Date('2026-10-02T00:00:00.000Z');

const open: ServiceCase = {
  id: 'case-1',
  publicId: 'CASE-2026-000001',
  serialNumber: 'SN-1',
  origin: 'SALES',
  symptom: '전원이 켜지지 않음',
  relatedCaseId: null,
  status: 'OPEN',
  disposition: null,
  openedAt,
  confirmedAt: null,
  scrappedAt: null,
};
const doaScrap: ServiceCase = {
  ...open,
  status: 'DOA_CONFIRMED',
  disposition: 'SCRAP',
  confirmedAt: at,
};
const doaReturn: ServiceCase = { ...doaScrap, disposition: 'RETURN_TO_VENDOR' };
const rejected: ServiceCase = { ...open, status: 'REJECTED' };
const scrapped: ServiceCase = { ...doaScrap, status: 'SCRAPPED', scrappedAt: at };

describe('openCase', () => {
  it('접수 내용만으로 OPEN 상태의 접수를 만든다', () => {
    expect(
      openCase(
        {
          serialNumber: 'SN-1',
          origin: 'SALES',
          symptom: '전원이 켜지지 않음',
          relatedCaseId: null,
        },
        openedAt,
      ),
    ).toEqual({
      serialNumber: 'SN-1',
      origin: 'SALES',
      symptom: '전원이 켜지지 않음',
      relatedCaseId: null,
      status: 'OPEN',
      disposition: null,
      openedAt,
      confirmedAt: null,
      scrappedAt: null,
    });
  });
});

describe('confirmDoa', () => {
  it('OPEN 이면 처분과 확정 시각을 붙여 DOA_CONFIRMED 가 된다', () => {
    expect(confirmDoa(open, 'SCRAP', at)).toEqual({
      ...open,
      status: 'DOA_CONFIRMED',
      disposition: 'SCRAP',
      confirmedAt: at,
    });
  });

  it('OPEN 이 아니면 전이하지 않는다', () => {
    for (const current of [doaScrap, rejected, scrapped]) {
      expect(confirmDoa(current, 'SCRAP', at)).toBeUndefined();
    }
  });

  it('입력을 바꾸지 않는다', () => {
    confirmDoa(open, 'SCRAP', at);
    expect(open.status).toBe('OPEN');
  });
});

describe('reject', () => {
  it('OPEN 이면 REJECTED 가 된다', () => {
    expect(reject(open)).toEqual({ ...open, status: 'REJECTED' });
  });

  it('OPEN 이 아니면 전이하지 않는다', () => {
    for (const current of [doaScrap, rejected, scrapped]) {
      expect(reject(current)).toBeUndefined();
    }
  });
});

describe('scrap', () => {
  it('폐기 처분으로 DOA 확정된 접수만 SCRAPPED 가 된다', () => {
    expect(scrap(doaScrap, at)).toEqual({ ...doaScrap, status: 'SCRAPPED', scrappedAt: at });
  });

  it('반품 처분이거나 DOA_CONFIRMED 가 아니면 전이하지 않는다', () => {
    for (const current of [open, doaReturn, rejected, scrapped]) {
      expect(scrap(current, at)).toBeUndefined();
    }
  });
});
