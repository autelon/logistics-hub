import type { ReceivedQuantityLookup } from './purchase-order.js';

/**
 * 임시 구현: 발주 줄마다 받은 수량이 0 이다.
 *
 * TODO(구현 순서 5·6단계): 선적(`transport`)과 입고(`warehouse`)가 생기면 usecase 가 그쪽 서비스에서 줄별 누계를
 * 모아 `ReceivedQuantityLookup` 을 만들어 쓴다 (`docs/06-inbound-design.md` "발주 줄 하나로 보는 흐름").
 * 그때 이 파일을 지우고, 이것을 쓰는 usecase(get·revise·close·cancel)가 진짜 조회를 넘기게 바꾼다.
 * 받은 수량이 항상 0 인 동안에는 "주문 수량을 받은 수량 아래로 줄이기"와 "받은 것이 있는 발주 취소"가
 * 거절되는 경우가 없다. 그 검사들은 서비스와 도메인 함수에 이미 있고 단위 테스트로 확인된다.
 */
export const noReceiptsYet: ReceivedQuantityLookup = () => Promise.resolve(new Map());
