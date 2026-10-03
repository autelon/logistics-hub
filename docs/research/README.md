# 조사 자료

설계 결정의 근거로 쓰려고 2026-10-03 에 조사한 보고서들이다. 조사 에이전트가 원출처를 직접 읽고 쓴 것이며,
각 보고서 안에서 **확인(출처 있음) / 추정 / 미확인** 을 구분해 두었다. 추정·미확인으로 표시된 내용을 사실처럼 쓰지 않는다.

| 파일                                                                                   | 내용                                                                                                          |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [inbound-data-structures.md](inbound-data-structures.md)                               | 발주·선적·운송 서류·입하/입고/적치의 데이터 구조. SAP 테이블, X12/EDIFACT, B/L·AWB, Incoterms, 최소 필드 제안 |
| [procurement-shipping-ownership-customs.md](procurement-shipping-ownership-customs.md) | 발주서 실무, 분할 선적·혼재, 소유권·운송 중 재고, 포워더가 주는 정보, 수입 통관 데이터                        |
| [korean-3pl-wms-inbound.md](korean-3pl-wms-inbound.md)                                 | 국내 3PL·풀필먼트 WMS 의 입고 단계·수량·채널·시리얼·로트 지원 증거 표                                         |
| [global-wms-inbound.md](global-wms-inbound.md)                                         | SAP EWM, Dynamics 365, Oracle WMS, Amazon FBA, ShipBob 의 입고 단계와 화주 통보, 시리얼 처리                  |
| [edi-receiving-serial-standards.md](edi-receiving-serial-standards.md)                 | X12 944/861/947/856, EDIFACT/EANCOM RECADV·DESADV, GS1 XML, EPCIS/CBV, GS1 AI(21) 의 입고 통보·시리얼 규격    |
| [lot-batch-tracking.md](lot-batch-tracking.md)                                         | 제품별 추적 방식(없음/로트/시리얼) 설계와 로트가 요구되는 규제·표준(국내 법령 포함)                           |
| [doa-replacement-refund.md](doa-replacement-refund.md)                                 | DOA 의 교체/환불 결정을 SAP·Dynamics·NetSuite 가 어디서 누가 하는지, 국내 소비자분쟁해결기준                  |

설계에 반영한 결론은 [../06-inbound-design.md](../06-inbound-design.md) 에 있고, 사용자 확인이 남은 항목도 거기에 있다.
