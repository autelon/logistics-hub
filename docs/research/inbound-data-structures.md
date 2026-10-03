# 입고(Inbound) 데이터 구조 조사 보고서: PO → 선적 → 운송서류 → 입하/입고/적치

조사 방법: SAP 테이블 사전(leanx.eu), SAP Learning/Help, ICC Incoterms 2020 서문 PDF, DCSA Track & Trace 2.1 PDF(둘 다 텍스트를 직접 추출해 확인), X12/EDIFACT 구현 가이드, 한국 WMS 매뉴얼을 웹에서 확인했습니다. 파일은 수정하지 않았습니다.

확인 수준이 낮은 항목은 본문에 **미확인**으로 표시했습니다. GS1 EANCOM 원문 PDF(DESADV/RECADV)와 SAP Help 일부 페이지는 403 또는 JS 렌더링으로 본문을 열지 못해, 검색 결과 요약에만 근거한 부분이 있습니다.

---

## 1. 발주서(Purchase Order): 헤더/라인 필드

### (a) 표준·시스템이 하는 방식

**SAP 헤더(EKKO)** — 필드 존재와 설명을 확인했습니다.

| 필드            | 의미                      |
| --------------- | ------------------------- |
| EBELN           | 발주번호                  |
| BSTYP / BSART   | 문서 범주 / 문서 유형     |
| LIFNR           | 공급업체                  |
| BEDAT           | 발주일                    |
| WAERS / WKURS   | 통화 / 환율               |
| ZTERM           | 지급조건 키               |
| INCO1 / INCO2   | 인코텀즈 코드 / 지정 장소 |
| EKORG / EKGRP   | 구매조직 / 구매그룹       |
| IHREZ / UNSEZ   | 상대방 참조 / 당사 참조   |
| LOEKZ           | 삭제 표시                 |
| FRGKE, PROCSTAT | 승인 / 처리 상태          |
| KDATB / KDATE   | 유효기간                  |

**SAP 라인(EKPO)**

| 필드                  | 의미                                            |
| --------------------- | ----------------------------------------------- |
| EBELP                 | 라인번호                                        |
| MATNR / TXZ01         | 자재 / 품명 텍스트                              |
| WERKS / LGORT         | 플랜트 / 저장위치(입고 목적지)                  |
| MENGE / MEINS         | 발주수량 / 단위                                 |
| NETPR / PEINH / BPRME | 순단가 / 가격단위(예: 100개당) / 가격 기준 단위 |
| NETWR                 | 라인 금액                                       |
| UEBTO / UNTTO         | 과납 / 미납 허용 한도(%)                        |
| UEBTK                 | 무제한 과납 허용 플래그                         |
| ELIKZ                 | "납품완료" 표시(미달이어도 라인을 닫음)         |
| WEPOS                 | 입고 대상 여부                                  |
| BSTAE                 | 확인 통제 키(ASN 필수 여부 등)                  |
| INSMK                 | 입고 시 재고 유형                               |
| WEBAZ                 | 입고 처리 소요일                                |
| EAN11                 | EAN/UPC                                         |
| INCO1                 | 라인 단위 인코텀즈                              |
| LOEKZ                 | 삭제 표시                                       |

- **납기 분할(EKET)**: 한 라인에 여러 납기를 둡니다. ETENR(순번), EINDT(납기일), MENGE(예정수량), WEMNG(기입고 수량), SLFDT(통계용 납기일).
- **공급업체 확인(EKES)**: EBTYP(확인 범주: 수기/출하통지 등), EINDT, MENGE, VBELN(연결된 인바운드 딜리버리), XBLNR, CHARG. PO 라인과 ASN을 잇는 다리 역할입니다.
- **X12 850**: BEG(PO번호·일자), CUR(통화), FOB(인도조건 지시), ITD(지급조건), DTM(일자), N1(당사자), PO1(라인 기본 데이터), SCH(라인 납기 스케줄). 세그먼트 이름과 용도만 확인했고 요소별 코드값은 **미확인**입니다. 과부족 허용을 850에서 어떻게 표현하는지도 **미확인**입니다.
- **EDIFACT ORDERS**: BGM(문서번호), DTM(발주일·요청 납기), NAD(+RFF, 당사자), CUX(통화), PAT(지급조건), LIN/PIA(품목), QTY(수량), PRI(단가)를 확인했습니다. TOD(인도조건) 세그먼트와 QTY+21, PRI+AAA 같은 한정자 값은 **미확인**입니다.

**추적 시스템 관점의 필수/선택**

| 구분            | 필드                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------- |
| 필수            | PO번호, 공급자, 발주일, 상태, 라인번호, SKU, 발주수량·단위, 요청 납기, 목적지 창고             |
| 강력 권장       | 인코텀즈+지정장소(운송 중 재고 귀속 판단), 과부족 허용률, 라인 종결 플래그, 공급자 측 주문번호 |
| 선택(회계 성격) | 지급조건, 환율, 세금, 계정지정, 구매조직/그룹, 승인 상태                                       |
| 선택이지만 저렴 | 단가, 통화(7번 참조)                                                                           |

### (b) 출처

- https://leanx.eu/sap/table/ekko/
- https://leanx.eu/sap/table/ekpo/
- https://leanx.eu/sap/table/eket/
- https://leanx.eu/sap/table/ekes/
- https://zenbridge.io/edi-dictionary/X12/6020/850-purchase-order/
- https://www.gs1.org/sites/default/files/docs/eancom/s4/orders.pdf (본문 미열람)
- https://learning.sap.com/courses/inventory-management-and-physical-inventory-in-sap-s-4hana/posting-a-goods-receipt-with-reference

### (c) 우리 모델에의 시사점

- 헤더/라인 2단 구조는 그대로 두되, 납기 분할은 처음에는 라인의 `requested_delivery_date` 하나로 충분합니다. 분할 납기가 실제로 생기면 schedule 테이블을 추가합니다.
- 과부족 허용은 라인에 `over_tolerance_pct`, `under_tolerance_pct`(nullable)로 둡니다.
- "입고누계 < 발주수량이지만 종결"을 표현할 `closed`(= ELIKZ) 플래그가 필요합니다. 없으면 미달 PO가 영원히 미완료로 남습니다.
- 인코텀즈는 `코드 + 지정장소` 두 필드로 저장합니다(SAP INCO1/INCO2와 같은 형태).
- 지급조건은 자유 텍스트 선택 필드면 충분합니다.

---

## 2. PO ↔ 선적 다대다, ASN 계층, 시리얼/로트

### (a) 표준·시스템이 하는 방식

**X12 856(ASN)**은 HL 루프의 부모 포인터로 트리를 만듭니다.

| 레벨         | 내용                                                                            |
| ------------ | ------------------------------------------------------------------------------- |
| Shipment (S) | 운송사, 출하일, 중량, 라우팅                                                    |
| Order (O)    | 원 PO번호 참조. 한 shipment 아래 Order 루프가 여러 개 가능하므로 1선적 = N개 PO |
| Tare (T)     | 팔레트, 팔레트 SSCC                                                             |
| Pack (P)     | 카톤, 카톤 SSCC(MAN 세그먼트)                                                   |
| Item (I)     | LIN(품목 ID), SN1(출하수량)                                                     |

- 거래처별로 SOTPI, SOPI, STPI, SI 등 변형 구조를 씁니다.
- 반대 방향(1 PO = N 선적)은 같은 PO번호를 참조하는 856이 여러 번 오는 것으로 표현됩니다. SAP에서는 EKES 확인 행 여러 개와 EKET-WEMNG 누계로 나타납니다.
- **시리얼/로트**: Item 레벨의 REF 세그먼트로 싣습니다. `REF*SE`(시리얼)는 라인당 여러 번 반복 가능하고, `REF*LT`는 로트입니다. 거래처 가이드마다 차이가 있습니다.

**EDIFACT DESADV**

- CPS(포장 계층) → PAC(포장 수·유형) → PCI(마킹) → GIN(식별번호: SSCC는 GIN+BJ) → LIN / QTY(출하수량) / RFF(주문번호 참조).
- 시리얼·배치용 GIN 한정자(BN, BX 등)는 **미확인**입니다. 검색 요약이 "GIN+BJ로 시리얼"이라고 섞어 서술해 신뢰하기 어렵습니다.

**GS1 SSCC**

- 18자리 = 확장자리 1 + GS1 회사 프리픽스 + 일련참조 + 체크디지트(mod 10).
- GS1-128 바코드에서 AI (00)으로 표시합니다.
- 물류 단위(팔레트/카톤) 식별자이며, ASN과 실물 라벨을 매칭하는 키입니다.

**SAP 인바운드 딜리버리(LIKP/LIPS)**

| 테이블     | 필드                                                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LIKP(헤더) | VBELN, LIFNR, LFDAT(납품일), BOLNR(B/L), TRAID(운송수단 ID), LIFEX(공급자 납품서 번호), ANZPK(포장 수), BTGEW(총중량), INCO1/2                                                                        |
| LIPS(라인) | VGBEL/VGPOS(참조 문서·라인 = PO와 PO 라인), LFIMG(납품수량), CHARG(배치), LICHN(공급자 배치), UECHA(배치 분할 상위 라인), SERAIL(시리얼 프로파일), ANZSN(시리얼 개수), HSDAT(제조일), VFDAT(유통기한) |

한 딜리버리의 라인들이 서로 다른 PO를 참조할 수 있어 다대다는 **라인 레벨**에서 풀립니다. 시리얼 실제 값이 저장되는 테이블(SER01/OBJK 계열)은 조사하지 않아 **미확인**입니다.

### (b) 출처

- https://www.edifabric.com/transactions/x12-856.html
- https://omniorders.com/blog/edi-856-asn-explained
- https://derbyfab.com/wp-content/uploads/2025/09/Derby_856_v04010.pdf
- https://www.cardinalhealth.com/content/dam/corp/web/documents/brochure/CardinalHealth-ASN856Guidelines.pdf
- https://www.gs1.org/sites/default/files/docs/eancom/s4/desadv.pdf (403, 본문 미열람)
- https://ecosio.com/en/blog/what-is-a-desadv-with-sscc/
- https://en.wikipedia.org/wiki/Serial_shipping_container_code
- https://leanx.eu/sap/table/likp/
- https://leanx.eu/sap/table/lips/

### (c) 시사점

- `shipment`에는 PO FK를 두지 않습니다. `shipment_line.purchase_order_line_id`로 연결하면 다대다가 자연스럽게 풀립니다(SAP LIPS-VGBEL/VGPOS와 같은 방식).
- 포장 계층(팔레트/카톤/SSCC)은 초기에 선택 사항으로 둡니다. 제조사가 SSCC를 주지 않는 경우가 흔하므로 `package`(sscc nullable, parent_package_id) 테이블은 필요해질 때 추가합니다.
- 시리얼은 `shipment_line` 아래 자식 행(`shipment_line_serial`)으로, 로트는 라인 분할(같은 PO 라인, 로트만 다름)로 표현하는 것이 SAP 배치 분할 방식과 일치합니다.
- 제조사가 채번한 시리얼 목록을 ASN 시점에 받아 두면 입고 검수 때 대조 기준이 됩니다.

---

## 3. 운송 서류와 마일스톤

### (a) 표준·시스템이 하는 방식

**운송 수단별 식별자**

| 수단      | 주 식별자                                                                   | 부가 식별자                                                                  |
| --------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 해상      | B/L 번호(Master: 선사 발행, House: 포워더/NVOCC 발행)                       | 부킹번호, 컨테이너 번호, 씰 번호, 선명 + IMO 번호 + 항차, POL/POD(UN/LOCODE) |
| 항공      | AWB 번호(항공사 프리픽스 3자리 + 8자리, 끝자리는 앞 7자리 mod 7 체크디지트) | MAWB/HAWB 구분, 편명, 출발/도착 공항                                         |
| 국내 육상 | 운송장/송장번호 + 운송사                                                    | 차량번호                                                                     |

- **컨테이너 번호(ISO 6346)**: 소유자 코드 3자 + 장비 구분 1자(U/J/Z) + 일련번호 6자리 + 체크디지트 1 = 11자(예: APZU4812090). DCSA 문서에서 직접 확인했습니다.
- **국내 육상**: 국제 표준 근거는 찾지 못했습니다. 위 식별자는 실무 통념이며 **미확인**입니다.
- **B/L(FIATA FBL 포함) 기재 항목**: B/L 번호, Shipper(Consignor), Consignee, Notify party, 선명/항차, Place of receipt, POL, POD, Place of delivery, 화물 명세, Marks & numbers, 포장 수, 총중량, 컨테이너/씰 번호, 발행지·발행일, 원본 통수.
- **Master vs House**: MBL은 선사가 포워더/NVOCC에게 발행하며, shipper와 consignee가 포워더 및 그 도착지 대리점입니다. HBL은 포워더가 실화주에게 발행하며 실제 수출자와 수입자가 기재됩니다.

**카디널리티**

- 1 B/L : N 컨테이너(FCL 여러 대).
- 1 컨테이너 : N House B/L(LCL 혼재).
- 1 MBL : N HBL.
- 따라서 B/L과 컨테이너는 다대다이고, HBL은 MBL을 부모로 참조합니다.

**마일스톤: 해상(DCSA Track & Trace 2.1)**

| 이벤트 종류    | 코드                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| Shipment(문서) | RECE, DRFT, PENA, PENU, REJE, APPR, ISSU, SURR, SUBM, VOID, CONF, RELS, HOLD                                     |
| Transport      | ARRI(도착), DEPA(출발)                                                                                           |
| Equipment      | GTIN(게이트 인), GTOT(게이트 아웃), LOAD(적재), DISC(양하), STUF(적입), STRP(적출), PICK, DROP, INSP, RSEA, RMVD |

- 이벤트 분류자는 **PLN / EST / ACT**(계획/예상/실적)입니다.
- 이벤트 공통 필드는 eventDateTime(발생 시각), eventCreatedDateTime(기록 시각), UN Location Code, facility code, vessel IMO, carrier voyage number, empty/laden 구분입니다.
- 조회 키는 Carrier Booking Reference, Transport Document Reference(B/L), Equipment Reference(컨테이너)입니다.
- 통관 관련 CUSS/CUSI/CUSR 코드는 서드파티 문서(Vizion)에만 보였고 DCSA 원문에서는 확인하지 못해 **미확인**입니다.

**마일스톤: 항공(IATA Cargo iQ / FSU)**

- RCS(화주로부터 인수), DEP(출발), ARR(도착), RCF(항공편에서 인수), NFD(수하인 통지), DLV(인도).

**한국 수입 통관**

- 수입신고번호 14자리 = 신고인부호 5 + 연도 2 + 일련번호 7.
- 화물관리번호 19자리 = MRN 11 + MSN 4 + HSN 4. 관세청 유니패스에서 B/L 또는 화물관리번호로 통관 진행을 조회합니다.
- 구성 설명은 관세청 서식 작성요령과 블로그를 인용한 검색 요약 기준이며, 원문을 직접 열람하지는 않았습니다.

### (b) 출처

- https://dcsa-website.cdn.prismic.io/dcsa-website/65b0ab0d615e73009ec3df0f_20210716_DCSA-Interface-Standard-for-Track-and-Trace-2.1_Final.pdf
- https://docs.vizionapi.com/docs/dcsa-event-code-types
- https://cargox.io/content-hub/master-bill-of-lading-vs-house-bill-of-lading
- https://www.inboundlogistics.com/articles/house-bill-of-lading-vs-master-bill-of-lading/
- https://www.legiscomex.com/sites/legiscomex/files/2025-02/Negotiable%20FIATA%20Multimodal%20Transport%20Bill%20of%20Lading.pdf
- https://en.wikipedia.org/wiki/Air_waybill
- https://airwaybilltracker.com/awb-number-format.html
- https://www.iata.org/contentassets/169b00e69b264cc5ac203af757596dc6/2016-03-cargo-industry-mop.pdf
- https://en.wikipedia.org/wiki/ISO_6346
- https://www.tradlinx.com/blog/guide/수입신고필증-수입면장-보는-법/
- https://unipass.customs.go.kr

### (c) 시사점

- `transport_document`는 유형(MBL/HBL/MAWB/HAWB/국내 운송장), 번호, 발행자, `parent_document_id`(House → Master)를 갖는 단일 테이블로 둡니다.
- 컨테이너는 별도 테이블로 두고 B/L과 다대다 조인합니다. LCL에서는 컨테이너 번호가 없거나 늦게 통지되므로 nullable입니다.
- 마일스톤은 고정 컬럼이 아니라 이벤트 행으로 저장합니다. 필드는 `code`, `classifier`(PLN/EST/ACT), `occurred_at`, `reported_at`, `location`, `source`입니다. DCSA가 발생 시각과 기록 시각을 분리한 방식이 "파트너 보고를 기록하고 정정한다"는 우리 요구와 정확히 맞습니다.
- 수단 공통 최소 코드셋을 권장합니다: 출고(공장) → 출발지 터미널 반입 → 선적/탑재 → 출발 → 도착 → 양하 → 통관 완료(수입신고 수리) → 터미널 반출 → 창고 도착.

---

## 4. 입하 / 검수 / 입고 / 적치의 분리

### (a) 표준·시스템이 하는 방식

**SAP 재고관리(IM)**

| 이동 유형 | 동작                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 101       | PO 대비 직접 입고. 자재 문서와 회계 문서가 함께 생성되고 자사 재고가 됨                                                               |
| 103 → 105 | 103은 "GR blocked stock"으로 입고. 자재 문서만 생기고 회계 전표와 평가가 없음(도착은 했으나 미수락). 105로 해제하면 101과 동일한 효과 |
| 107 → 109 | **평가된** GR blocked stock. 107 시점에 가치를 인식(원산지 수락, 도착 전 송장 처리 가능)하고 109로 해제                               |

- 입고 시 재고 유형은 가용(unrestricted) / 품질검사 / 보류(blocked) 세 가지입니다.
- 자재 문서(MSEG) 필드: MBLNR/MJAHR/ZEILE(문서 키), BWART(이동 유형), MENGE/MEINS, ERFMG/ERFME(입력 단위 수량), EBELN/EBELP(PO 참조), VBELN_IM/VBELP_IM(인바운드 딜리버리 참조), CHARG, INSMK(재고 유형), GRUND(사유), ELIKZ, SMBLN(취소 대상 문서), BUDAT(전기일), XBLNR(참조 번호).
- **정정은 원 문서를 수정하지 않고 역분개 문서로** 합니다(SMBLN이 취소 대상 원 문서를 참조).

**SAP EWM**

- 인바운드 딜리버리 → 야드 체크인(TU 도착) → 하차(unloading 웨어하우스 태스크) → GR 전기 → (선택) 품질검사·해체(deconsolidation)·VAS → 적치 태스크 확인 순입니다.
- GR 시점은 설정에 따라 다릅니다. GR 존에서 먼저 전기하고 적치할 수도 있고, 적치 태스크 확인 시 암묵적(implicit) GR이 될 수도 있습니다.
- GR 존 재고와 최종 빈 재고를 별도 가용성 그룹으로 분리할 수 있습니다.
- 수량 차이는 예외 코드 DIFD와 프로세스 코드 I001(차이 반영 + 문서 수량 조정), I002, I003(조정 없이 차이만 기록), I004(딜리버리 거부)로 처리합니다.

**수령 통지 EDI**

- **X12 861**: RCD 세그먼트에 수령수량(RCD02), 문제 수량(RCD09 "Quantity in Question"), 수령 상태 코드를 담습니다. 상태 값 02=수락, 04=부족, 05=파손, 07=거부, 09=과다는 검색 요약 기준이며 원문 대조는 하지 못했습니다.
- **X12 944**(3PL 창고 → 화주): W17(수령일, 창고 수령번호, 화주 PO/선적 식별자, F=전량/P=부분 수령)과 W07(품목별 수령수량·단위·품목 ID).
- **EDIFACT RECADV**: QTY(수령·수락 수량)와 QVR(차이 수량 + 불일치 사유 코드 4221: AF=파손, AC=과다 출하, AG=지연, CP=부분 완료)을 씁니다. 예시는 "출하 100, 수락 95, 차이 −5(AF)"입니다. QTY 한정자 번호는 **미확인**입니다.

**한국 실무**

- 용어 정의(물류 해설 자료): 입하(入荷)는 차량 도착 → 하차 → 검수 → 입고 대기장 이동까지이고, 입고(入庫)는 대기장에서 보관 위치로 옮기고 입고확정해 재고로 등록하는 것입니다. 흐름은 입하 → 검품 → 입고 → 적치입니다.
- 사방넷 풀필먼트 WMS 매뉴얼(확인): 진행 상태는 `예정등록 / 미입고 / 부분입고 / 입고완료`입니다. 수량은 예정수량, 입고수량, 회송수량, **입고확정수량 = 입고수량 − 회송수량**입니다. 유통기한/제조일자는 상품 설정에 따라 입력합니다.
- 다른 국내 WMS에서 "입하예정 등록 / 입하검사 / 입고적치" 메뉴 구성이 검색 요약에 보였으나 원문 페이지에서 확인하지 못했습니다.
- 국내 3PL WMS들이 입하/검수/입고확정/적치를 **각각 별도 상태값**으로 두는지는 벤더마다 다르며, 일반화할 근거는 **미확인**입니다. 확인한 사방넷은 입하와 입고를 구분하지 않고 "입고" 하나로 처리합니다.
- "입하검품 완료 시 소유권이 물류센터 측으로 이전"이라는 블로그 서술이 있으나, 3PL은 보관 책임만 지고 소유권은 화주에게 있으므로 그대로 받아들이면 안 됩니다.

**단계별 수량 정리**

| 단계 | 기록 수량                                                     |
| ---- | ------------------------------------------------------------- |
| 예정 | 예정수량(ASN 수량)                                            |
| 입하 | 도착수량(대개 박스/팔레트 단위), 외관 파손                    |
| 검수 | 정상(수락), 불량/파손, 거부/회송, 부족/과다(= 예정 대비 차이) |
| 입고 | 입고확정수량(재고 반영분), 재고 상태(가용/보류/검사)          |
| 적치 | 로케이션별 수량                                               |

### (b) 출처

- https://learning.sap.com/courses/inventory-management-and-physical-inventory-in-sap-s-4hana/posting-a-goods-receipt-with-reference
- https://community.sap.com/t5/enterprise-resource-planning-blog-posts-by-members/significance-of-movement-types-103-105-107-and-109/ba-p/13562531 (403, 검색 요약만)
- https://leanx.eu/sap/table/mseg/
- https://blog.sap-press.com/what-happens-during-inbound-processing-in-sap-embedded-ewm
- https://community.sap.com/t5/supply-chain-management-blog-posts-by-sap/how-to-prevent-implicit-goods-receipt-posting-in-sap-ewm/ba-p/13547806
- https://community.sap.com/t5/supply-chain-management-blog-posts-by-members/process-codes-for-delivery-quantity-adjustment/ba-p/13530720
- https://www.ediverse.io/en/standards/x12/861/
- https://www.dla.mil/Portals/104/Documents/DLMS/Transformats/ICs/4010/41f861_A.pdf
- https://www.proedi.com/edi-transactions/edi-944-warehouse-stock-transfer-receipt-advice
- https://www.gs1.org/sites/gs1/files/docs/eancom/s4/recadv.pdf (403)
- https://www.gs1si.org/Standardi/EANCOM-2016/ean02s4/part2/recadv/examples.htm
- https://www.sbfulfillment.co.kr/manual/receiving
- https://brunch.co.kr/@@7DUh/199
- https://modoopedia.kr/입고-뜻-출고-뜻/
- https://systems.logisall.com/kr/sub/subscription/wms.asp

### (c) 시사점

- 실제 시스템은 **도착(비평가·미수락) → 수락(재고 반영) → 적치(위치 확정)**를 분리합니다. 다만 파트너가 모든 단계를 보고하지는 않습니다(사방넷처럼 "입고" 한 번만 보고).
- 따라서 `receipt` 하나에 단계별 타임스탬프와 수량을 모두 nullable로 두거나, 단계별 이벤트 행(`receipt_event`: type = ARRIVAL / INSPECTION / GOODS_RECEIPT / PUTAWAY)으로 설계해 **단계 생략을 허용**해야 합니다.
- 재고 반영 기준은 "입고확정(= SAP 105/101, 944의 W07 수량)" 하나로 고정하는 것을 권장합니다.
- 라인 수량은 `expected`, `received`, `accepted`, `rejected`, `damaged`를 저장합니다. short/over는 파생값(expected − received)이므로 저장하지 않고, `discrepancy_reason`만 저장합니다.
- 정정은 SAP처럼 원 기록을 덮어쓰지 않고 **역분개/정정 행**으로 남기는 방식이 감사 추적에 맞습니다.

---

## 5. 소유권 / 운송 중 재고

### (a) 표준·시스템이 하는 방식

- ICC 원문(직접 확인): 인코텀즈는 **소유권(property/title/ownership) 이전을 다루지 않으며**, 이는 매매계약에서 별도로 정해야 합니다. 인코텀즈가 정하는 것은 인도 지점, 위험 이전, 비용 분담, 통관 의무입니다.

**위험 이전 시점(Incoterms 2020)**

| 조건            | 위험 이전 시점                                                                          |
| --------------- | --------------------------------------------------------------------------------------- |
| EXW             | 매도인 구내에서 매수인 처분에 맡긴 때                                                   |
| FCA             | 지정 장소에서 매수인이 지정한 운송인에게 인도한 때                                      |
| CPT / CIP       | 첫 운송인에게 인도한 때(운임은 목적지까지 매도인 부담)                                  |
| FAS             | 선적항 선측                                                                             |
| FOB / CFR / CIF | 선적항에서 **본선 적재(on board) 시**. CFR/CIF는 운임(및 보험)만 목적항까지 매도인 부담 |
| DAP             | 목적지에서 양하 준비 상태로 매수인 처분에 맡긴 때                                       |
| DPU             | 목적지에서 양하 완료 후                                                                 |
| DDP             | DAP와 같은 지점 + 수입 통관·관세까지 매도인 부담                                        |

- FAS/FOB/CFR/CIF는 해상·내수로 전용입니다.
- "선박 난간(ship's rail) 통과"는 2000 버전까지의 구 기준입니다. ICC 2020 서문은 "on board"로 서술하며, 이를 PDF 텍스트에서 확인했습니다.
- 개별 조건의 세부 문구는 ICC 본문(유료)이 아닌 서문과 2차 자료 기준입니다.

**실무상 재고 인식**

- 회계에서는 통제권 이전 시점에 재고를 인식하며, 보통 인코텀즈의 위험 이전 시점을 그 지표로 씁니다.
- FOB shipping point류(EXW/FCA/FOB/CFR/CIF)는 선적 시 매수인 재고(미착품, goods in transit)가 됩니다. D조건(DAP/DPU/DDP)은 도착 시 인식합니다.
- 계약에 소유권 유보 조항이 있으면 달라질 수 있습니다.
- IFRS 15 / IAS 2 원문 대조는 하지 않았으므로 회계 기준 조항 번호는 **미확인**입니다.

**SAP 표현**

- 107(평가된 GR blocked stock 입고) → 109(해제): 원산지 수락 시점에 가치를 인식하고, 도착 후 가용 재고로 전환합니다.
- "Inbound Delivery with Valuated Stock in Transit": 인바운드 딜리버리 품목 범주가 109 계열 이동 유형을 쓰며, 운송 중 소유권 이전을 평가된 운송 중 재고로 표현합니다. SAP Help 페이지 제목과 검색 요약으로만 확인했고, 본문은 JS 렌더링으로 열람하지 못해 세부 절차는 **미확인**입니다.

### (b) 출처

- https://www.icc-switzerland.ch/images/723e_inco2020_eng_intro.pdf
- https://help.sap.com/docs/SAP_ERP/96bf9ad642cf4b26a29595e3d573fb8c/ad95d0c4dfa04a8b9f6a6c90010464a2.html
- https://help.sap.com/docs/SAP_ERP/96bf9ad642cf4b26a29595e3d573fb8c/0850a5bf2a924f94b7259935b7abf3fc.html
- https://learning.sap.com/courses/inventory-management-and-physical-inventory-in-sap-s-4hana/posting-a-goods-receipt-with-reference
- https://www.accountingcoach.com/terms/F/fob-shipping-point
- https://gofreight.com/glossary/fob-shipping-point-vs-fob-destination

### (c) 시사점

- "소유권 이전 시점"을 인코텀즈에서 자동 확정하지 않습니다. PO에 `incoterm`, `incoterm_place`를 저장하고, 여기서 **기본값을 유도하되 덮어쓸 수 있는** `ownership_transfer_point`(예: ON_SHIPMENT / ON_BOARD / ON_ARRIVAL / ON_RECEIPT)를 PO 또는 shipment에 둡니다.
- 운송 중 재고는 별도 테이블이 아니라 파생값으로 봅니다. "소유권 이전 마일스톤이 ACT로 찍혔고 아직 입고확정되지 않은 shipment_line 수량"이 곧 운송 중 자사 재고입니다.

---

## 6. 비시리얼 품목의 추적 단위

### (a) 표준·시스템이 하는 방식

- **SAP**: 자재 마스터의 배치 관리 플래그(XCHPF)가 켜지면 모든 재고 이동에 배치(CHARG)가 필수입니다. 시리얼은 별도의 시리얼 번호 프로파일(SERNP)로 제어합니다. 둘은 독립적이며 자재 단위로 설정합니다. 공급자 배치(LIPS-LICHN), 제조일(HSDAT), 유통기한(VFDAT)이 함께 다닙니다. XCHPF는 EKPO에는 없고 자재 마스터 쪽 필드라는 점을 확인했습니다.
- **Odoo**: 제품의 Tracking 필드가 `No Tracking`(버전에 따라 By Quantity) / `By Lots` / `By Unique Serial Number` 3택입니다. 로트는 공통 속성을 가진 묶음에 하나의 번호를 주고, 시리얼은 개체당 고유 번호를 줍니다.
- **언제 로트를 쓰는가**: 유통기한·제조일 관리(FEFO), 리콜·품질 추적, 규제 품목(식품·의약·화장품)에 쓰는 것이 통상적입니다. 일반 공산품은 SKU 수량만 관리합니다. 이 판단 기준은 위 문서들의 정의에서 유추한 통념이며 단일 표준 출처는 없습니다.

### (b) 출처

- https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/25a41481f62e469ba0e61015a0d39d20/990eb753128eb44ce10000000a174cb4.html
- https://leanx.eu/sap/table/lips/
- https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/product_tracking.html
- https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/product_management/product_tracking/lots.html
- https://www.sbfulfillment.co.kr/manual/receiving

### (c) 시사점

- 제품에 `tracking_mode ∈ {NONE, LOT, SERIAL}` 한 필드를 두는 것이 업계 공통 설계입니다.
- NONE이면 수량만, LOT이면 라인에 `lot_no`(+ 제조일/유통기한 선택)를 두고 로트별로 라인을 분할하며, SERIAL이면 시리얼 자식 행을 둡니다.
- 지금 로트 품목이 없어도 `lot_no` nullable 컬럼을 shipment_line과 receipt_line에 미리 두면 나중에 마이그레이션 비용이 작습니다.

---

## 7. PO 라인 단가

### (a) 표준·시스템이 하는 방식

- SAP에서 GR 시 회계 전표는 PO 가격으로 전기되고, GR/IR 계정도 항상 PO 가격으로 전기됩니다.
- 가격 통제 **S(표준원가)**: 재고는 항상 표준가로 평가하고 PO가와의 차이는 가격 차이 계정으로 보냅니다.
- 가격 통제 **V(이동평균)**: 입고·송장마다 총재고가치 ÷ 총수량으로 단가를 재계산합니다.
- PO 통화는 EKKO-WAERS, 단가는 EKPO-NETPR이며 PEINH(가격 단위)와 세트입니다.
- **Landed cost**: 구매가 + 국제 운임 + 관세 + 보험 + 내륙 운송 + 취급 수수료를 수량/금액/중량 기준으로 품목에 배부합니다.

### (b) 출처

- https://blog.sap-press.com/what-is-the-difference-between-moving-average-price-and-standard-price-in-sap
- https://learning.sap.com/courses/business-processes-in-sap-s-4hana-sourcing-procurement/analyzing-material-valuation
- https://erpcollege.co/2022/03/18/material-price-calculation-in-po-gr-and-invoice/
- https://www.intacct.com/ia/docs/en_US/help_action/Purchasing/Using_Purchasing/Landed_costs/landed-costs-overview.htm
- https://leanx.eu/sap/table/ekpo/

### (c) 시사점

- 추적 시스템이 평가(이동평균, landed cost)를 직접 할 필요는 없습니다.
- 그래도 `unit_price` + `currency`는 PO 라인에 nullable로 저장하기를 권장합니다. 이유는 세 가지입니다.
  - 운송 중·보관 재고의 금액 가시성(보험, 클레임 금액 산정)에 쓰입니다.
  - 수입신고·상업송장 대조에 쓰입니다.
  - 나중에 회계 연동 시 원천 데이터가 됩니다.
- 통화는 헤더에 두고(SAP 방식), 단가는 라인에 둡니다. 가격 단위(per N)는 단가를 1단위 기준으로 정규화해 저장하면 생략할 수 있습니다.
- 환율, 세금, 부대비용 배부는 범위 밖으로 둡니다.

---

## 제안: 최소 필드 목록

(선택) = 파트너가 자주 제공하지 않거나 해당 수단에만 존재해 nullable로 둘 항목입니다.

**purchase_order**

- 필수: `id`, `po_number`, `supplier_id`, `order_date`, `status`(DRAFT/ISSUED/CONFIRMED/PARTIALLY_SHIPPED/…/CLOSED/CANCELLED), `currency`, `destination_warehouse_id`
- 선택: `incoterm`, `incoterm_place`, `ownership_transfer_point`(인코텀즈에서 기본값 유도, 수정 가능), `supplier_order_ref`(공급자 측 주문번호), `payment_terms`(텍스트), `remarks`

**purchase_order_line**

- 필수: `id`, `purchase_order_id`, `line_no`, `product_id`, `ordered_qty`, `uom`, `requested_delivery_date`, `closed`(납품완료 플래그)
- 선택: `confirmed_delivery_date`(공급자 확답), `unit_price`, `over_tolerance_pct`, `under_tolerance_pct`, `cancelled`
- 파생(저장하지 않음): shipped_qty, received_qty, open_qty

**shipment** (파트너가 보고한 한 번의 출하 = ASN 헤더)

- 필수: `id`, `shipment_no`(내부 번호), `shipper_id`(제조사), `mode`(SEA/AIR/ROAD), `destination_warehouse_id`, `status`, `reported_by`, `reported_at`
- 선택: `supplier_delivery_note_no`(공급자 납품서/패킹리스트 번호), `forwarder_id`, `origin_location`, `ship_date`, `eta`, `package_count`, `gross_weight`, `import_declaration_no`(수입신고번호 14자리), `cargo_control_no`(화물관리번호), `customs_cleared_at`

**shipment_line**

- 필수: `id`, `shipment_id`, `purchase_order_line_id`(다대다를 푸는 지점), `product_id`, `shipped_qty`, `uom`
- 선택: `lot_no`, `manufacture_date`, `expiry_date`, `container_id`, `sscc`/`package_ref`
- 자식 테이블 `shipment_line_serial`(`shipment_line_id`, `serial_no`): tracking_mode가 SERIAL일 때만 사용

**transport_document**

- 필수: `id`, `shipment_id`, `type`(MBL/HBL/MAWB/HAWB/ROAD_WAYBILL), `document_no`
- 선택: `parent_document_id`(House → Master), `issuer`(선사/항공사/포워더/택배사), `issue_date`, `booking_no`, `consignee`, `notify_party`, `vessel_name`, `vessel_imo`, `voyage_no`, `flight_no`, `port_of_loading`, `port_of_discharge`(UN/LOCODE 또는 공항 코드), `place_of_delivery`, `vehicle_no`
- 한 B/L이 여러 shipment를 덮는 경우가 생기면 `shipment_id` 대신 조인 테이블로 바꿉니다.

**container**

- 필수: `id`, `container_no`(ISO 6346 11자, 체크디지트 검증)
- 선택: `seal_no`, `size_type`(ISO 코드, 예 22G1/45G1), `load_type`(FCL/LCL)
- 조인 테이블 `transport_document_container`(다대다). 항공·육상·LCL에서는 컨테이너 자체가 없을 수 있습니다.

**shipment_milestone** (이벤트 행)

- 필수: `id`, `shipment_id`, `code`(FACTORY_OUT / ORIGIN_GATE_IN / LOADED / DEPARTED / ARRIVED / DISCHARGED / CUSTOMS_CLEARED / GATE_OUT / DELIVERED_TO_WAREHOUSE), `classifier`(PLANNED/ESTIMATED/ACTUAL), `occurred_at`, `reported_at`, `source`(파트너/수기/API)
- 선택: `container_id`, `transport_document_id`, `location_code`, `location_name`, `remarks`, `supersedes_id`(정정 시 이전 행 참조)

**receipt** (창고 보고, 헤더)

- 필수: `id`, `warehouse_id`, `status`(EXPECTED/ARRIVED/INSPECTING/RECEIVED/PUTAWAY_DONE), `reported_by`, `reported_at`
- 선택: `shipment_id`(ASN 없이 도착하는 경우 null), `warehouse_receipt_no`(창고 측 입고번호, 944 W17 대응), `arrived_at`(입하), `inspected_at`, `received_at`(입고확정 = 재고 반영 기준), `putaway_completed_at`, `vehicle_no`, `reverses_receipt_id`(정정/취소 시 원 기록 참조)
- 많은 3PL이 입하/검수/적치 시각을 주지 않고 입고확정만 보고하므로, 필수 시각은 사실상 `received_at`뿐입니다.

**receipt_line**

- 필수: `id`, `receipt_id`, `product_id`, `accepted_qty`(입고확정수량), `uom`
- 선택: `shipment_line_id`, `purchase_order_line_id`, `expected_qty`(ASN에서 복사), `arrived_qty`(입하 시 박스 기준 등), `rejected_qty`(회송), `damaged_qty`, `discrepancy_reason`(SHORT/OVER/DAMAGED/WRONG_ITEM/…), `stock_status`(AVAILABLE/HOLD/QC), `lot_no`, `expiry_date`
- 자식 테이블 `receipt_line_serial`(`serial_no`, `result`): ASN 시리얼과 대조
- 자식 테이블 `putaway`(`receipt_line_id`, `location_code`, `qty`, `putaway_at`): 창고가 로케이션을 공유하지 않으면 전체 생략 가능

---

## 조사 한계 요약(미확인 항목)

- X12 850의 요소 단위 코드값과 과부족 허용 표현.
- EDIFACT ORDERS의 TOD 및 QTY/PRI 한정자, DESADV의 시리얼·배치용 GIN 한정자, RECADV의 QTY 한정자 번호(GS1 원문 PDF 403).
- SAP "valuated stock in transit" 인바운드 프로세스의 세부 절차(Help 본문 미열람), 시리얼 값 저장 테이블.
- DCSA 통관 이벤트 코드(CUSS/CUSI/CUSR)의 원문 근거.
- 국내 3PL WMS가 입하/검수/입고확정/적치를 별도 상태로 두는지. 사방넷 1건만 원문을 확인했고, 사방넷은 분리하지 않습니다.
- 국내 육상 운송 식별자의 표준 근거.
- 수입신고번호·화물관리번호 구성의 관세청 원문 대조.
- 회계 기준(IFRS 15 / IAS 2) 조항 원문 대조.
