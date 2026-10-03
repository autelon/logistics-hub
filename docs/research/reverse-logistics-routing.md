# 역방향(리버스) 물류 흐름 조사: 회수된 단위의 물리적 경로와 체인상 시스템·역할

조사 범위는 물리적 경로(어디로, 누가 정하고, 어떤 문서가 구간을 시작하는가)와 가시성 허브가 받을 수 있는 사실(이벤트)입니다. 교환/환불 판단 로직은 제외했습니다.

## 0. 조사 방법과 한계

- **확인**은 해당 문서를 직접 열어 읽은 경우입니다. 벤더 문서, 표준, 법령, 원문 PDF가 여기에 해당합니다.
  - SCOR 6.0, SCOR DS 가이드, GS1 CBV 2.0, Rogers & Tibben-Lembke(1998)의 PDF는 텍스트를 추출해 직접 읽었습니다.
  - 나머지 웹페이지는 fetch 도구가 요약한 결과입니다. 숫자·코드처럼 정확해야 하는 항목만 원문과 대조했습니다.
- **추정**은 검색 결과 발췌, 2차 사본, 블로그·뉴스만으로 얻은 내용이거나 정황상 합리적인 추론입니다.
- **미확인**은 근거를 찾지 못한 경우입니다.
- 한계는 다음과 같습니다.
  - SAP Help Portal(help.sap.com)은 JS 렌더링 때문에 본문을 열지 못했습니다. SAP 코드표는 SAP Support 지식베이스(KBA)와 2차 사본으로 대체했습니다.
  - Reverse Logistics Association(RLA) 자체 표준 문서는 확인하지 못했습니다. 대신 RLA의 전신인 Reverse Logistics Executive Council 보고서(Rogers & Tibben-Lembke, 1998)를 1차 학술·업계 근거로 썼습니다. 25년 이상 된 자료라 2020년대 관행과 다를 수 있습니다.
  - 한국 제조사 RTV(제조사 반송)의 실무 관행은 공개 근거를 거의 찾지 못했습니다(Q3 표 참고).

---

## Q1. 표준 역방향 물류 단계와 처분(disposition) 종류

### 근거표

| 출처                                      | 발견                                                                                                                                                                                                                                                                                                                                                                                                                                 | URL                                                                                                                               | 수준       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Rogers & Tibben-Lembke 1998, 3.4절(p.87)  | 각 역방향 시스템의 단계는 gatekeeping(진입 허용 결정), collection(수집), sortation(각 건의 처리 결정), disposition(목적지로 발송)입니다.                                                                                                                                                                                                                                                                                             | https://www.icesi.edu.co/blogs/gestionresiduossolidos/files/2008/11/libro-lr.pdf                                                  | 확인       |
| 같은 문서, 2.1절                          | Gatekeeping은 불량·부당 반품을 역방향 진입점에서 걸러내는 일입니다. 폐기할 물건은 조기에 알수록 운송비가 절감됩니다. 예로 파손 청소기를 800km 운송해 버리는 것은 비효율이라고 설명합니다.                                                                                                                                                                                                                                            | 위와 동일                                                                                                                         | 확인       |
| 같은 문서, 표 2.3(p.49) 및 3.3절(p.78-79) | 표준 disposition 코드는 세 묶음입니다. Disposal은 Scrap/Destroy, Secure Disposal, Donate, Third-party disposal, Salvage, Third-party sale(2차 시장)입니다. Repair/Modify는 Rework, Remanufacture/Refurbish, Modify, Repair, **Return to Vendor**입니다. Other는 Use as is, Resale, Exchange입니다. 주요 7개 채널은 Return to Vendor, Sell as New, Outlet/할인, 2차 시장, 기부, Remanufacture/Refurbish, 소재 회수/재활용/매립입니다. | 위와 동일                                                                                                                         | 확인       |
| 같은 문서, 표 2.2                         | 반품 사유 코드에 "Dead on Arrival – Did not work", "Defective", "Factory Repair – Return to vendor for repair"가 있습니다.                                                                                                                                                                                                                                                                                                           | 위와 동일                                                                                                                         | 확인       |
| 같은 문서, 2.4절                          | 중앙 반품센터(CRC)는 한 곳에서 분류한 뒤 다음 목적지로 보냅니다. CRC가 소매 가이드라인에 따라 disposition을 결정합니다. 응답자의 약 70%가 CRC를 사용하며, 외주 CRC가 사내 CRC보다 수익성 영향이 작았습니다(3.7% 대 4.8%). 70%는 검색 요약 수치이고, 4.8%/3.7%는 원문에서 확인했습니다.                                                                                                                                               | 위와 동일                                                                                                                         | 확인       |
| SCOR 6.0 개요                             | Return은 Source Return(sSR1~3)과 Deliver Return(sDR1~3)으로 나뉩니다. sR1 불량: 반품 승인, 반품 일정, 수령·검증·disposition, 교체 또는 크레딧. sR2 MRO: 승인·일정, 상태 판정, 이전, 상태 검증, disposition. sR3 초과재고: 초과 식별, 출하 일정, 수령, 승인, 검증, 회수·disposition.                                                                                                                                                  | https://www2.isye.gatech.edu/~lfm/8851/Sources/SCOR/SCOR%206.0%20OverviewBooklet.pdf                                              | 확인       |
| ASCM SCOR Digital Standard 가이드(현행)   | 구조가 바뀌어 R1 Return Product, R2 Return Service, R3 Return MRO입니다. R1의 요소 순서는 R1.1 개시·승인·일정·검증, R1.2 수령, R1.3 RMA 종결·조정, R1.4 진단·테스트, R1.5 Disposition, R1.6 문서, R1.7 Transfer, R1.8 재무 조정, R1.9 보관입니다.                                                                                                                                                                                    | https://www.ascm.org/globalassets/documents--files/corporate-transformation/scor-ds-digital-guide_final.pdf                       | 확인       |
| GS1 CBV 2.0                               | 반품 전용 bizStep(`returning`)은 없습니다. 반품에는 `receiving`, `holding`(격리), `inspecting`, `repairing`, `destroying`, `storing`, `shipping`을 조합합니다. 해당하는 disposition 값은 `returned`, `damaged`, `disposed`, `non_conformant`, `available`, `needs_replacement`, `recalled` 등입니다. 예시도 "반품센터에서 returned 수령"이고 "반품 제품을 sellable/damaged로 inspecting"입니다.                                      | https://ref.gs1.org/standards/cbv/ (PDF: https://www.gs1.org/sites/default/files/docs/epc/CBV-Standard-1-2-r-2016-09-29.pdf 계열) | 확인       |
| Thierry 외 1995(Rogers 보고서 2.6절 인용) | 제품 회수 옵션은 repair, refurbish, remanufacture, cannibalize, recycle 다섯 가지입니다.                                                                                                                                                                                                                                                                                                                                             | 위 Rogers 문서                                                                                                                    | 확인(인용) |

### 보편적 합의

- 순서는 **승인(gatekeeping) → 수집 → 입고·검사/진단 → disposition → 재분배·이전**이며, 현행 SCOR도 같습니다. SCOR DS는 diagnose(R1.4) 후 disposition(R1.5), 그 후 transfer(R1.7)입니다.
- 처분 종류는 재판매(신품/오픈박스/리퍼), 수리, RTV, 재활용, 폐기, 2차 시장 매각(liquidate), 기부로 수렴합니다. 소비자 가전 맥락에서는 이 목록이 사실상 표준입니다.
- **판정(disposition)과 실행(이동)은 별개 사건**입니다. SCOR도 R1.5 Disposition 뒤에 R1.7 Transfer를 따로 둡니다. 허브 모델에서도 둘을 구분해야 합니다.

### 특수 상황과 대응

- "불량 신고인데 실제로는 정상"인 건(non-defective defective)은 반품센터에 도착해서야 드러납니다(Rogers p.77-78). 경로가 입고 후에야 확정되므로, 계획 경로와 실제 경로를 따로 기록해야 합니다.
- 같은 제품도 반품 진입 지점(고객 반품, 소매 과재고, 유통사 반품)에 따라 다른 경로를 탑니다(Rogers p.74). 반품 "출처 유형"이 경로 결정의 입력입니다.

---

## Q2. SAP / Dynamics 365 / Oracle의 물리 경로와 구간 시작 문서

### 근거표

| 시스템             | 출처                       | 발견                                                                                                                                                                                                                                                                                                                                                                                                                                                                | URL                                                                                                                                                                               | 수준                                             |
| ------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| SAP ARM            | SAP KBA 3569034            | 후속 활동 0005(Ship to Supplier)는 **반품 구매오더(RPO)**를 만듭니다. 0004(Ship to Other Plant)는 반품 이전오더(STO)입니다. 회피책은 0001(Receive into plant) → 0015 → NB2 유형 RPO를 수동 생성하는 것입니다. 0004를 반품오더 생성 시 지정하지 못하는 것은 클라우드판의 기능 공백입니다.                                                                                                                                                                            | https://userapps.support.sap.com/sap/support/knowledge/en/3569034                                                                                                                 | 확인                                             |
| SAP ARM            | SAP KBA 3675873            | 재고 이전(free stock), 폐기, 공급자 반품 같은 물류 후속 활동은 **창고의 검사 결과 입력 시점**에 트리거됩니다. 환불 제어가 "Decide later"(R) 또는 "No refund"(N)이면 트리거되지 않는 결함이 보고됩니다.                                                                                                                                                                                                                                                              | https://userapps.support.sap.com/sap/support/knowledge/en/3675873                                                                                                                 | 확인                                             |
| SAP ARM            | SAP 도움말 사본(pdfcoffee) | **반품오더 생성 시** 지정하는 후속 활동 코드입니다. 0001 입고(반품 창고, 보통 blocked), 0002 즉시 free stock, 0003 즉시 scrap, 0004 타 플랜트(STO), 0005 공급자 발송(RPO), 0006 타 플랜트 경유 공급자(STO 후 RPO), 0007 **고객→공급자 직송**(RPO, 고객 픽업 주소), 0008 고객 현장 검사, 0009 입고 예정이나 자재 미확정, 0013 자재가 고객에 잔류, 0014 지정 재고, 0016 사내 수리(수리오더), 0017 외부 수리(수리오더+외주 오더), 0021 고객에게 반송(출고 납품)입니다. | https://pdfcoffee.com/advanced-returns-management-for-customer-returns-pdf-free.html                                                                                              | 추정(SAP 원문 사본, help.sap.com 직접 열람 실패) |
| SAP ARM            | help.sap.com 검색 발췌     | **검사 후** 후속 활동으로 0011 free stock, 0012 scrap, 0015 지정 재고, 0031 "추가 활동 없음"(blocked 유지), 0026 사내 수리(서비스), 0004/0005/0021이 열거됩니다.                                                                                                                                                                                                                                                                                                    | https://help.sap.com/docs/SAP_S4HANA_CLOUD/87f9b54f9c4f4e75aff0061860a6589a/aeb252c114df4dac9abf1626ccb04233.html                                                                 | 추정(발췌만)                                     |
| SAP ARM            | PIKON 블로그               | 검사팀이 `MSR_INSPWH`에서 후속 활동과 환불을 정하고, 검사 **확정**이 후속 활동을 트리거합니다. "검사를 통해 unrestricted, scrap, 벤더 반송 중 목적지를 결정"합니다.                                                                                                                                                                                                                                                                                                 | https://www.pikon.com/en/blog/how-sap-advanced-returns-management-optimizes-your-return-process/                                                                                  | 추정(2차)                                        |
| SAP ARM            | All for One 백서           | 공급자 반품은 반품 구매오더 또는 반품 STO를 만들고, 공급자 승인번호(RMA) 필수 여부를 설정할 수 있습니다. 검사 유형은 고객 현장, 영업사원, 창고 입고, 공급자 현장입니다.                                                                                                                                                                                                                                                                                             | https://www.all-for-one.pl/en/whitepapers/advanced-returns-management-in-sd-and-mm/                                                                                               | 추정(2차)                                        |
| D365 SCM           | MS Learn Sales returns     | 물리 반품은 **반품오더(RMA, Returned order 유형 판매오더)** → 창고 도착·검사 → disposition 결정 → packing slip 생성(disposition 확정) → 인보이스입니다. 반품 입고 창고는 RMA 헤더의 site/warehouse가 정합니다(이 창고가 배송지 주소가 됨). 기본 disposition 액션은 6종(Credit, Credit only, Replace and credit, Replace and scrap, Return to customer, Scrap)입니다. 격리(quarantine)를 쓰면 도착 시점에 disposition 코드를 못 정하고, 격리 오더 종료 시 정합니다.  | https://learn.microsoft.com/en-us/dynamics365/supply-chain/sales-marketing/sales-returns                                                                                          | 확인                                             |
| D365 SCM           | MS Learn Disposition 문서  | disposition 코드는 **반품오더 생성, 도착 등록, packing slip 업데이트, 격리 종료** 중 어느 시점에든 적용할 수 있습니다. 예시 코드에 RP(Repair), RV(Return to Vendor), RF(Refurbish), SC(Scrap), RS(Resale), TS(제3자 매각), DC(기부)가 있습니다. 이 목록은 Rogers 표 2.3과 거의 동일합니다. 단, 모든 코드는 6개 기본 액션 중 하나에 매핑돼야 합니다.                                                                                                                 | https://learn.microsoft.com/en-us/dynamics365/supply-chain/sales-marketing/specify-how-to-dispose-of-returned-items                                                               | 확인                                             |
| D365 SCM           | MS Learn 구매오더 생성     | 공급자 반품은 **별도의 구매오더**를 `Returned order` 유형으로 만들며, 공급자 승인번호(RMA) 입력이 필수이고 라인 수량은 음수입니다. 따라서 "RTV"는 판매 반품오더의 disposition 액션이 아니라 구매 측 별도 문서입니다.                                                                                                                                                                                                                                                | https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/purchase-order-creation                                                                                    | 확인                                             |
| D365 SCM           | MS Learn 비예고 반품       | WMS 모바일에서 `Return details`(출고 시 발행된 return ID 라벨)나 `Blind return`(RMA 없음)로 받습니다. 모바일 반품 수령에서는 disposition 코드가 필수입니다. 수령 후 RMA가 자동 생성됩니다.                                                                                                                                                                                                                                                                          | https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/sales-returns-unannounced                                                                                  | 확인                                             |
| D365 Field Service | MS Learn                   | RMA 제품 라인의 **Processing Action**을 반품 접수 시 정합니다: Create RTV(공급자/제조사 반송), Return to warehouse, Change Asset Ownership. RTV는 별도 레코드이고 상태(승인/발송/수령)를 수동 갱신합니다. 창고행 RMA 수령은 재고 저널을 자동 생성합니다.                                                                                                                                                                                                            | https://learn.microsoft.com/en-us/dynamics365/field-service/process-return                                                                                                        | 확인                                             |
| D365               | dynamics-tips              | 공급자 반품 단계는 RMA 번호 입력, Pick, Product receipt(packing slip), 차변전표(debit note)입니다. 고급 창고관리는 공급자 반품을 지원하지 않아 수동 피킹이 필요하다고 서술합니다. 작성 시점이 불명확해 현재도 유효한지는 모릅니다.                                                                                                                                                                                                                                  | https://dynamics-tips.com/vendor-return/                                                                                                                                          | 추정                                             |
| Oracle Fusion      | docs.oracle.com 검색 발췌  | RMA 판매오더 생성 시 Receiving의 RMA 레코드와 Shipping 레코드가 함께 생성됩니다. 수령 담당이 RMA 번호로 receiving advice를 만들고, 품질팀이 검사하며, 통과하면 고객 반송 또는 재고 입고(put away)이고 불합격이면 수리나 salvage입니다. 수령 확인(receipt confirmation) 배치가 주문관리에 RMA 수령을 반영합니다.                                                                                                                                                     | https://docs.oracle.com/en/cloud/saas/supply-chain-management/22b/famlo/return-material-authorization.html                                                                        | 추정(페이지 본문 미열람)                         |
| Oracle Fusion      | Depot Repair 개요          | 서비스 요청 → **RMA 판매오더**(+ 연결된 출하 라인) → 수리창고 재고 수령 → 필요 시 다지점 **이전오더**(고객 → 로컬 창고 → 물류센터 → 수리 depot) → 유지보수 작업오더 → 수리 완료품 출하오더입니다. 이전오더는 RMA에 연결돼 Depot Repair 화면에서 추적합니다.                                                                                                                                                                                                         | https://docs.oracle.com/en/cloud/saas/service-logistics/26a/fasul/overview-of-depot-repair.html                                                                                   | 확인                                             |
| Oracle Fusion      | 외부 WMS 연동 문서         | 외부 3PL/WMS와는 **receipt advice(PO/ASN/RMA) 전송 → WMS 수령 → receipt confirmation 반환**으로 연동합니다. RMA는 `SourceDocumentTypeCode: RMA`로 처리됩니다. 시리얼·로트도 포함됩니다. 검사·put away는 후속 receipt transaction입니다.                                                                                                                                                                                                                             | https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/fasrp/use_case_integrate_receipt_advice_receipt_confirmation_processes_external_systems_integration.html | 확인                                             |
| Oracle Fusion      | Using Receiving 검색 발췌  | 공급자 반품은 Receiving에서 Return to Receiving과 Return to Supplier 트랜잭션을 만들고 원 PO 수량을 재오픈합니다. 즉 원 PO 수령에 걸린 거래입니다.                                                                                                                                                                                                                                                                                                                  | https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26a/famli/using-receiving.pdf                                                                                | 추정(발췌)                                       |

### 경로별 구간 시작 문서 요약

| 경로                   | SAP ARM                                                      | D365                                                                                                                       | Oracle                               |
| ---------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 고객 → 창고(수령)      | 반품오더 + 반품 납품(0001)                                   | RMA(반품오더) + 도착 저널                                                                                                  | RMA 판매오더 + receiving advice      |
| 창고 → 공급자(RTV)     | 반품 구매오더(0005), 타 플랜트 경유 시 반품 STO 후 RPO(0006) | 별도 구매 `Returned order`(공급자 RMA 번호)                                                                                | 원 PO 수령에 대한 Return to Supplier |
| 고객 → 공급자 직송     | 0007: RPO에 고객 픽업 주소                                   | Field Service에서 RMA 제품의 RTV 처리 액션(직송 여부는 문서에 없음, 미확인)                                                | 미확인                               |
| 고객 → 서비스센터/수리 | 0016/0017: 수리오더, 외부는 외주 구매오더                    | Field Service RMA(처리 액션별) 또는 반품 → 생산/수리 오더(MS Learn은 반품 대체오더로 수리용 생산오더 생성 가능하다고 서술) | RMA + Depot Repair 이전오더·작업오더 |

### 경로는 RMA 생성 시점에 정해지는가, 검사 후인가

- **확인(SAP)**: 두 단계 구조입니다. 반품오더 생성 시 초기 후속 활동을 지정하고, 0001/0008/0009처럼 자재·상태가 불확실한 경우는 창고 검사 결과 입력 시점에 후속 활동이 확정·트리거됩니다(KBA 3675873).
- **확인(D365)**: 기본 흐름은 도착·격리 시점에 disposition을 정합니다. 단 생성 시점에도 지정할 수 있어, 둘 다 가능합니다. Field Service는 RMA 제품 라인 입력 시 처리 액션을 정합니다.
- **확인(Oracle Depot Repair)**: RMA 라인의 category와 service activity code로 depot 로지스틱스가 RMA 생성 시 정해지고, 이전오더는 수령 후 Depot Repair 화면에서 만듭니다.
- 결론: **대부분 시스템이 계획 경로(RMA 시점)와 확정 경로(검사 후)를 분리해 다룹니다.** 허브도 이를 따라야 합니다.

### 보편적 합의

- 반품 권한 문서(RMA)가 체인 전체의 대체키입니다. D365 문서가 "RMA 번호는 반품 프로세스 전반의 대체 키"라고 명시합니다.
- 고객 → 창고 수령과 창고 → 공급자 반송은 **별개 문서·별개 구간**입니다. SAP은 RPO, D365는 별도 구매 반품오더, Oracle은 PO 수령 기준 Return to Supplier입니다.
- 공급자 반송에는 **공급자가 발급한 승인번호**가 필요합니다(SAP 옵션, D365 필수).

### 특수 상황과 대응

- 직송(고객 → 공급자)은 SAP만 명시적 코드(0007)가 있고 D365·Oracle은 문서에서 확인하지 못했습니다. 허브는 "우리 창고를 거치지 않는 경로"를 일반 경로로 허용해야 합니다.
- 위 시스템들은 예시일 뿐 귀사가 쓰는 ERP인지 알 수 없습니다(사용자 확인 항목).
- SAP 0005의 생성 문서는 KBA 3569034(RPO)와 검색 발췌("outbound delivery 생성")가 달라, 시점·버전 차이로 보입니다. 허브는 문서 유형에 의존하지 말고 "구간 시작 이벤트"로 모델링하는 편이 안전합니다.

---

## Q3. 반품 구간 운영 주체와 한국 실무

### 근거표

| 출처                                   | 발견                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | URL                                                                                                                                                                         | 수준            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Rogers 1998                            | 중앙 반품센터가 표준 형태이며 외주(3PL) 비율이 높습니다. 제조사 쪽에서는 RA 생성 → 픽업 자동화 → ASN 발행 → 수령 순서이며, 당시 제조사 다수는 반품을 수동으로 입고했습니다.                                                                                                                                                                                                                                                                                                                                      | 위 Rogers PDF                                                                                                                                                               | 확인            |
| 사방넷 풀필먼트 반품 매뉴얼            | 3PL 역할: 고객사(브랜드)가 반품요청 등록 → **물류사가 반품택배접수(택배사에 수거 요청)** → 반송장 입력(개별 또는 엑셀) → 반품입고처리. 시스템은 매일 한 번 택배사로부터 반송장 정보를 일괄 수신합니다. 상태값은 반품요청, 반품진행중, 반품입고완료, 반품취소 4종입니다. 입고처리 화면 입력은 입고수량·**폐기수량**이고, 입고분은 "반품기본존"에 들어가며 폐기분은 자동 반출됩니다. 정상 출고하려면 재고 이동으로 출고가능존에 옮겨야 합니다. 별도 검수 단계는 문서에 없고 "즉시완료"/"전량폐기" 버튼이 있습니다. | https://www.sbfulfillment.co.kr/manual/orderReturn                                                                                                                          | 확인            |
| 이지어드민(WMS/OMS) 도움말             | 회수 처리: 회수 요청 → 회수 접수(택배사 전산 반영) → **반품송장 발번**(택배사마다 시점이 다름: 당일배송은 즉시, 우체국은 야간 반영, 기타는 하루 2회) → 입고 → 검수/재입고/폐기. 택배사 전산 접수 전에만 수정·삭제가 가능합니다.                                                                                                                                                                                                                                                                                  | https://help.ezadmin.co.kr/index.php?title=%ED%9A%8C%EC%88%98                                                                                                               | 확인            |
| 네이버 풀필먼트(NFA, 파스토 가이드)    | 반품 6단계: 신청(구매자 또는 FMS) → 수거 → 센터 도착·검수 → 검수 판정 → 반품 승인/거부 → 환불. **수거상태**: 수거신청, 수거예정, 수거진행중, 수거완료, 상품회수불가. **검수상태**: 검수전, 검수진행중, 검수완료. 판매자가 승인/거부를 정하고 물류센터가 검수·판정하며, 자동승인 설정 시 정상 판정이면 자동 승인됩니다. 재입고/폐기/반송 같은 검수 후 처리는 이 페이지에 명시가 없습니다.                                                                                                                         | https://guide-kr.fassto.ai/nfa/return                                                                                                                                       | 확인            |
| 네이버 N배송 FBN 기사                  | 판매자가 반품을 신청하면 **한진이 수거하고 입고 후 처리**하는 식으로 회수를 일원화했습니다(2026-08-24 기사).                                                                                                                                                                                                                                                                                                                                                                                                     | https://m.news.nate.com/view/20260824n28936                                                                                                                                 | 추정(뉴스 요약) |
| 네이버 Commerce API 토론               | 수거 방식 필드 `collectDeliveryMethod`: RETURN_DESIGNATED(지정 반품택배, 현재 우체국·CJ), RETURN_DELIVERY(판매자 계약 택배 자동 수거), RETURN_INDIVIDUAL(직접 발송 또는 수기 송장). 우선순위는 계약 택배 → 지정 택배입니다.                                                                                                                                                                                                                                                                                      | https://github.com/commerce-api-naver/commerce-api/discussions/2023                                                                                                         | 확인            |
| 쿠팡 Open API(회수 송장 등록)          | 굿스플로 반품 자동연동을 **쓰지 않는** 판매자가 회수 송장을 직접 등록합니다(`receiptId`, `deliveryCompanyCode`, `invoiceNumber`, 택배사 회수번호 `regNumber` 선택). 반품 상태가 `RETURNS_UNCHECKED`일 때만 가능하며, 기사가 회수하기 전까지 고객이 철회할 수 있습니다.                                                                                                                                                                                                                                           | https://developers.coupang.com/hc/ko/articles/360034027394-%ED%9A%8C%EC%88%98-%EC%86%A1%EC%9E%A5-%EB%93%B1%EB%A1%9D                                                         | 확인            |
| 쿠팡 Open API(반품 목록)               | `receiptStatus`: RELEASE_STOP_UNCHECKED, RETURNS_UNCHECKED, VENDOR_WAREHOUSE_CONFIRM, REQUEST_COUPANG_CHECK, RETURNS_COMPLETED. `returnDeliveryDtos`에 택배사 코드·송장번호가 있습니다. `returnDeliveryType`은 회수 방식(전용 택배, 연동 택배, 수기)입니다. `faultByType`은 귀책(COUPANG, VENDOR, CUSTOMER, WMS, GENERAL), `completeConfirmType`은 완료 확인 방식(VENDOR_CONFIRM, CS_CONFIRM 등), `returnShippingCharge`는 부호로 부담 주체(양수는 판매자)를 나타냅니다.                                         | https://developers.coupang.com/ko/api/returns/return-cancellation-request-list-query                                                                                        | 확인            |
| G마켓 ESM API                          | 반품 수거 송장 등록 API는 G마켓·옥션 지정택배를 쓰지 않고 판매자가 직접 택배사에 수거를 요청하는 경우에 씁니다. 필수 값은 주문번호, 택배사 코드(5자리), 송장번호입니다.                                                                                                                                                                                                                                                                                                                                          | https://etapi.gmarket.com/55                                                                                                                                                | 확인            |
| 반품 택배 비교 가이드(리터니즈)        | CJ는 원송장번호로 반품을 예약하면 주소 입력이 불필요하고 통상 D+1 수거입니다. 한진은 자사가 배송한 건만 반품을 취급합니다.                                                                                                                                                                                                                                                                                                                                                                                       | https://returneeds.com/blog/online-seller-guide/2024%EB%85%84-%ED%95%9C%EC%A7%84%ED%83%9D%EB%B0%B0-%EB%B0%98%ED%92%88-vs-cj-%EB%B0%98%ED%92%88-%EA%B0%80%EC%9D%B4%EB%93%9C/ | 추정(블로그)    |
| 택배 반품 접수/운임                    | CJ대한통운은 홈페이지, ARS, 앱, 영업소로 반품 예약하고, 착불(신용) 수거 접수가 가능합니다. 오후 4시 이전 신청은 D+1 방문이라는 안내가 있습니다(검색 발췌).                                                                                                                                                                                                                                                                                                                                                       | (검색 결과의 안내 페이지들, 공식 페이지 미열람)                                                                                                                             | 추정            |
| 전자상거래법 제18조(찾기쉬운 생활법령) | 단순변심 반품비는 소비자가, 상품 하자 반품비는 판매자가 부담합니다. 철회 7일, 표시광고와 다른 경우 3개월 또는 안 날부터 30일, 환급 3영업일 이내입니다.                                                                                                                                                                                                                                                                                                                                                           | https://www.easylaw.go.kr/CSP/CnpClsMain.laf?csmSeq=835&ccfNo=4&cciNo=1&cnpClsNo=2                                                                                          | 확인            |
| 삼성전자서비스                         | 택배 접수 시 지정 택배는 CJ대한통운이고 보증기간 내에는 왕복 택배비가 무료라는 안내가 있습니다(검색 발췌).                                                                                                                                                                                                                                                                                                                                                                                                       | https://www.samsungsvc.co.kr/ (공식 페이지 본문 미열람)                                                                                                                     | 추정            |
| 제조사 RTV(제조사 반송) 한국 관행      | 일괄 vs 건별, 크레딧 vs 교환, 반송 운임 부담 등 가전 유통사 ↔ 제조사 사이의 한국 관행을 직접 설명하는 공개 자료는 찾지 못했습니다.                                                                                                                                                                                                                                                                                                                                                                               | -                                                                                                                                                                           | 미확인          |

### 보편적 합의

- 운영 주체는 세 가지가 공존합니다. ① 택배사가 고객에게서 회수(반품 송장은 원송장과 **별도 번호**), ② 3PL/풀필먼트의 반품 입고·검수, ③ 제조사 서비스센터입니다. 어느 쪽이 맡는지는 상품군과 계약에 따라 달라집니다.
- 한국 이커머스 3PL의 회수 흐름은 **회수 요청 → 택배사 접수 → 반품송장 발번 → 회수(집하) → 입고 → 검수 → 재입고/폐기**로 수렴합니다(이지어드민·사방넷·NFA 모두 유사).
- 반품 운임 부담은 반품 사유(변심 vs 하자)에서 법적으로 갈립니다. 선불·착불·계약운임은 그 부담을 정산하는 수단입니다.

### 특수 상황과 대응

- 3PL별로 검수 단계를 따로 두지 않기도 합니다(사방넷은 입고수량 + 폐기수량만 입력). **검수 결과값을 보고받지 못할 수 있으므로** 허브는 검수 이벤트를 선택 항목으로 두는 편이 맞습니다.
- 회수 주체와 송장 발번은 플랫폼 정책에 따라 바뀝니다(쿠팡·네이버·G마켓 각각 지정택배/계약택배/직접 방식을 병행). 한 플랫폼 안에서도 건마다 회수 방식이 다를 수 있습니다.
- 반품송장 번호는 택배사별로 발번 시점이 다르고(우체국 야간, 타사 하루 2회 등) 접수 직후엔 번호가 없을 수 있습니다. 반품 케이스는 송장번호 없이 생성돼야 합니다.
- 제조사 RTV는 공개 근거가 없으므로 **미확인**으로 두고 아래 "사용자 확인" 항목으로 넘깁니다.

---

## Q4. 소비자 가전 특수사항: DOA, 리퍼, 동반 데이터

### 근거표

| 출처                          | 발견                                                                                                                                                                                                                                                                                          | URL                                                                                                                                              | 수준                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| ASUS 코리아 노트북 정책       | **불량 판정은 공식 서비스센터만** 하고 불량판정서를 발급합니다. 판정서가 없으면 판매처가 교환·환불을 못 합니다. 환불 판정은 구매 후 10일, 교환 판정은 30일 이내입니다. DOA 교환품의 보증은 판정일부터 잔여 보증기간입니다. 반품에는 제품·구성품·박스가 필요합니다.                            | https://www.asus.com/kr/support/article/1150/                                                                                                    | 확인                        |
| 소비자분쟁해결기준(뉴스 인용) | 구입 후 10일 이내 정상 사용 중 중요한 수리를 요하는 하자는 신품 교환 또는 환급, 1개월 이내 신품 교환 또는 무상수리, 1년 이내 무상수리입니다.                                                                                                                                                  | https://www.etoday.co.kr/news/view/522109                                                                                                        | 추정(2차, 고시 원문 미열람) |
| Moxa DOA 정책                 | 출하 후 3개월 내 DOA는 무상 교체합니다. 판정은 벤더 재량이고 원포장·부속품이 필요하며, 벤더가 **서비스센터까지의 운송비를 부담**하고 DOA 요청 후 1개월 내 반송해야 합니다.                                                                                                                    | https://www.moxa.com/en/support/repair-and-warranty/defect-on-arrival                                                                            | 확인                        |
| Cisco 반품 정책               | 크레딧 반품은 **RMA 번호**(CCW 반품 도구, AAR 번호로 추적)가 필요하고 입력 항목은 판매오더/시리얼/PO 번호/사유입니다. 크레딧은 **RMA 발급 후 30일 내 물리적 수령 후**에 발행됩니다. DOA는 초기 전원 투입 시 실패이고 출하 후 180일 내 신고합니다. 크레딧 반품의 운송비는 고객 부담입니다.     | https://www.cisco.com/c/en/us/buy/customer-support-information/manage-order/return-a-product.html                                                | 확인                        |
| Claimlane RTV 가이드          | RTV 절차는 사유 연결 → 공급 계약 확인 → 공급자 RTV/RMA 번호 확보 → 증빙(사진, 시리얼/배치, PO, 적용 약관) → 발송 → 크레딧 노트 대조입니다. 정산 수단은 크레딧 노트(가장 흔함), 교체품, 수리입니다. 크레딧 노트가 원가와 대조되지 않아 분실되는 사례를 지적합니다.                             | https://www.claimlane.com/resources/blog/return-to-vendor-process                                                                                | 추정(업체 블로그)           |
| Rogers 1998, 3.3절(p.80-81)   | 벤더가 불량품 반환을 요구하는 이유는 ① 결함 원인 분석과 비결함 반품 비율 파악, ② 해당 품목이 다른 채널에서 신품으로 재판매돼 수요를 잠식하거나 브랜드가 훼손되는 것 방지, ③ 재반품 방지입니다. 반대로 **반환 없이 보상**하면서 소매에 파기 또는 상표 제거(deface)를 요구하는 경우도 있습니다. | 위 Rogers PDF                                                                                                                                    | 확인                        |
| Rogers 1998, 2.4절(p.52)      | 컴퓨터 업계에서는 소매가 모든 반품을 공개 RMA로 한 지점에 보내고, 사용 가능품은 대금을 지급받아 3자 리퍼·disposition 업체로 갑니다. 부적격품은 사전 규칙에 따라 폐기됩니다.                                                                                                                   | 위 Rogers PDF                                                                                                                                    | 확인                        |
| 리퍼 유입 경로                | 리퍼 소스는 ① 7일 내 미개봉 변심 반품, ② 사용·전시 흔적 반품(A/B급), ③ 제조사 공장 리퍼(초기불량이나 수리 후 정상 복구품), ④ 물류 파손품, ⑤ 법인 리스·반납품입니다. 공정은 검수 → 분류 → 리퍼 인증 → 재포장 → 재유통입니다.                                                                   | https://refurbnews.kr/%EB%A6%AC%ED%8D%BC-%EC%A0%9C%ED%92%88-%EC%96%B4%EB%96%A4-%EA%B2%BD%EB%A1%9C%EB%A1%9C-%EC%9C%A0%ED%86%B5%EB%90%A0%EA%B9%8C/ | 추정(업계 블로그)           |
| 리씽크                        | 반품 대행·리퍼 센터·A/S가 결합된 국내 업체로 "브랜드 인증 리퍼"와 서비스센터 시스템 연동을 내세웁니다.                                                                                                                                                                                        | https://rethink.kr/refurbish/                                                                                                                    | 추정(회사 소개)             |
| 쿠팡 반품센터                 | 수도권 반품 전용 센터에서 4개 등급(미개봉/우수/양호/보통)으로 분류하고 반품마켓에서 등급별 할인 재판매합니다.                                                                                                                                                                                 | https://www.mt.co.kr/living/2024/09/10/2024091014040658744                                                                                       | 추정(뉴스 요약)             |
| 동반 데이터                   | D365 return details는 라벨 바코드로 return ID를 싣고, 그 레코드가 원 주문·출하·행·반품 기한을 담습니다. RMA 번호가 대체키이고 반품 사유 코드·disposition 코드가 따라갑니다.                                                                                                                   | https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/sales-returns-unannounced                                                 | 확인                        |

### 보편적 합의

- 초기불량(DOA)의 **판정권은 제조사(또는 그 서비스센터)**에 있고, 소매는 판정서·RMA 승인에 따라 환불·교환·크레딧을 처리하는 구조가 일반적입니다(ASUS, Cisco, Moxa 공통).
- RTV는 공급자의 사전 승인번호 없이는 실행되지 않으며, 시리얼·사유·증빙이 같이 가야 크레딧이 나옵니다(Cisco, Claimlane, SAP·D365 옵션).
- 리퍼 경로는 「회수 → 검수 → 등급 분류 → 수리/클리닝 → 인증 → 재판매」이며 변심 반품, 서비스센터 회수, 초기불량이 모두 원료가 됩니다.
- 처분 선택은 "제조사 요구 + 가치"로 결정됩니다. 제조사가 현품 회수를 요구하면 RTV, 아니면 서비스센터 폐기·소매 측 리퍼·2차 시장입니다(Rogers).

### 특수 상황과 대응

- "RTV vs 서비스센터 폐기"는 **제조사와의 계약에 달린 문제**이고 일반 규칙이 없습니다. 반송 요구, 현지 폐기 허용, 크레딧 조건 모두 계약 항목이라 허브가 가정해서는 안 됩니다(사용자 확인).
- 서비스센터가 DOA를 판정하는 모델(ASUS형)에서는 현품이 소매 창고를 거치지 않고, **판정서만 소매로 이동**합니다. 이 경로의 물리 이벤트는 서비스센터가 보유합니다.
- 해외 제조사의 DOA 기한(출하 후 3개월, 180일 등)은 제조사마다 달라, 국내 법정 기한(10일/30일)과 별개로 관리해야 합니다.
- 고장 코드(fault code)의 표준 체계는 찾지 못했습니다. 미확인이며 제조사 서비스센터 코드 체계에 의존합니다.

---

## Q5. 가시성 시스템 관점에서 파트너가 보통 제공하는 사실과 그렇지 않은 사실

### 근거표

| 사실(이벤트)                                | 근거                                                                                                                | 일반적 가용성                                                                                                    | 수준                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 반품 접수/승인                              | 쿠팡 `RETURNS_UNCHECKED`, 사방넷 `반품요청`, NFA `수거신청`, D365 RMA, Oracle RMA                                   | 높음(주문/OMS/마켓플레이스 쪽에서 발생)                                                                          | 확인                                      |
| 회수 요청, 반품송장 번호                    | 이지어드민(발번 시점이 택배사별로 다름), 쿠팡 `returnDeliveryDtos`, 네이버 수거방식                                 | 높음, 단 접수 직후엔 송장 번호가 없을 수 있음                                                                    | 확인                                      |
| 택배 회수 스캔(집하·이동·배달)              | 택배 일반 추적 단계(집화처리, 간선상차/하차, 배송출발, 완료)와 반품 송장 추적 API(스마트택배, 굿스플로 반품 자동화) | 높음(일반 운송장과 동일 방식으로 추적 가능)                                                                      | 추정(반품 송장 전용 이벤트 목록은 미열람) |
| 창고 반품 입고(수령)                        | 사방넷 `반품입고완료`, 쿠팡 `VENDOR_WAREHOUSE_CONFIRM`, Oracle receipt confirmation, D365 도착 저널                 | 높음                                                                                                             | 확인                                      |
| 입고 수량과 시리얼                          | Oracle receipt confirmation(시리얼/로트 지원), D365 return ID 스캔                                                  | 중간(WMS의 시리얼 운용 수준에 의존)                                                                              | 확인(시스템 능력)/미확인(귀사 3PL)        |
| 검수 결과                                   | NFA `검수상태`, D365 격리 오더, SAP 검사                                                                            | 중간. 사방넷은 검수 단계 없음, NFA는 "상태"만 있고 양품/불량 결과는 문서에 없음                                  | 확인                                      |
| Disposition 판정(누가·언제·왜)              | D365 disposition 코드, SAP 후속 활동                                                                                | 낮음~중간. 시스템 내부엔 있으나 외부 파트너가 별도 보고하는 경우는 드묾. 한국 3PL은 수량(폐기수량) 수준만 확인됨 | 확인(시스템)/추정(보고 관행)              |
| Disposition 실행 확인(재고 전환, 폐기 반출) | 사방넷: 폐기수량 입력 시 자동 반출, 정상 출고는 재고 이동 필요                                                      | 중간(재고 변동으로만 간접 관측되는 경우 많음)                                                                    | 확인                                      |
| RTV 출고/발송                               | D365 packing slip(공급자 반품), SAP 반품 납품, 택배/물류 운송장                                                     | 높음(일반 출고 이벤트)                                                                                           | 확인                                      |
| 제조사 RTV 수령·검수 결과                   | Rogers: 제조사 대부분이 수동 수령, 데이터베이스 생성이 느리거나 없음                                                | 낮음(1998년 자료, 현재는 미확인)                                                                                 | 확인(과거)/미확인(현재)                   |
| 제조사 크레딧/교체품                        | Claimlane: 크레딧 노트가 대조되지 않아 분실. 재무 시스템에 존재                                                     | 낮음(물류 파트너가 아닌 재무·구매 쪽에서 생성)                                                                   | 추정                                      |
| 반품 귀책·사유                              | 쿠팡 `faultByType`, `reasonCode`, Rogers 사유 코드                                                                  | 중간(플랫폼은 제공, 3PL 직접 연동은 불확실)                                                                      | 확인                                      |

추가 근거로 Rogers(1998, p.45)는 "공급망이 순방향은 추적해도 역방향은 거의 추적되지 않는다"고 서술하며, "ASN은 얼마든지 받지만 반품이 들어온다는 정보는 아무도 주지 않는다"는 임원 인용도 싣습니다. 이는 확인된 과거 사실이고, 현재 상황은 파트너별로 다르므로 미확인입니다. 출처: https://www.icesi.edu.co/blogs/gestionresiduossolidos/files/2008/11/libro-lr.pdf

### 보편적 합의

- **수신 쪽(반품 접수, 송장, 회수, 입고)은 비교적 잘 보고되고**, **결정 쪽(검수 결과, disposition 판정, 제조사 수령·크레딧)은 약합니다.**
- 이벤트 어휘는 GS1 CBV 2.0의 `receiving`, `holding`, `inspecting`, `repairing`, `destroying`, `shipping`과 disposition 값(`returned`, `damaged`, `disposed`, `non_conformant`, `available`)으로 표현할 수 있습니다. 반품 전용 bizStep이 없으므로 이 조합이 비표준 확장 없이 쓸 수 있는 방식입니다(채택 여부는 선택).

### 특수 상황과 대응

- 검수·disposition 이벤트가 없는 파트너는 **추론 이벤트**(예: 재고 구분이 반품존에서 출고가능존으로 이동, 폐기수량 반출)로 대체할 수 있으나, 추론임을 표시해야 합니다.
- 제조사 쪽 사실(수령, 판정, 크레딧)은 파트너 보고가 아닌 **구매/재무 시스템 또는 수기 입력**이 원천일 가능성이 큽니다.

---

## 사용자 확인이 필요한 것 (계약·파트너에 달린 사항만)

- **3PL 운영 담당자에게**
  - 반품 입고 시 검수까지 3PL이 수행하는지, 검수 결과(양품/불량/보류)를 값으로 보고하는지 아니면 폐기수량만 입력하는지?
  - 반품 상품의 시리얼을 스캔·기록하는지?
  - 양품/불량/폐기/제조사반송 재고를 WMS에서 별도 존·상태로 구분하는지?
  - 반품 입고와 disposition 변경을 이벤트로 푸시해 주는지, 조회 API만 있는지?
- **택배 계약 담당자에게**
  - 반품 운임 형태는 선불, 착불, 계약운임 중 무엇이며, 하자 반품과 변심 반품을 어떻게 구분 정산하는지?
  - 반품 송장 발번 시점은 언제이고, 반품 송장의 추적 이벤트를 API/EDI로 받을 수 있는지?
- **구매·MD 담당자에게 (제조사 계약)**
  - 불량품은 현품 반송(RTV)을 요구하는지, 크레딧만 주고 현지 폐기(또는 상표 제거)를 허용하는지?
  - 반송 시 제조사 RMA 번호를 건별로 받는지, 일괄 RMA인지, 출하는 건별인지 박스·팔레트 단위 묶음인지?
  - 반송 운임은 누가 부담하고, 크레딧/교체품은 언제·어떤 서류로 오는지?
  - DOA 기한과 판정 주체(제조사 서비스센터 판정서 vs 자사 판정)는?
- **AS/CS 담당자에게**
  - 서비스센터 입고 경로는 고객 직접 방문, 지정 택배, 방문 수거 중 무엇이며, 소매 창고를 거치는 경우가 있는지?
  - 선교환(먼저 교체품 발송)을 하는지?
  - 센터에서 수리 불가 시 폐기·제조사 반송·리퍼 중 누가 결정하는지?
- **ERP/재무 담당자에게**
  - 사용하는 ERP가 SAP, D365, Oracle 중 하나인지, 아니면 자체 시스템인지? 제조사 크레딧 노트와 물류 케이스를 묶는 키(RMA 번호 등)가 있는지?

---

## 제안: 허브의 역방향 흐름 모델 (옵션 제시, 단일 권고 아님)

### 공통 설계 요소

- **반품 케이스** 하나가 경로 전체를 대표하고, `계획 경로`와 `실제 경로`를 분리합니다. 근거: SAP·D365·Oracle 모두 RMA 시점과 검사 후 시점이 다르고, 비결함 반품은 입고 후에야 드러납니다.
- **판정(disposition) 이벤트와 실행(이동) 이벤트를 분리**합니다. 근거: SCOR R1.5 대 R1.7.
- 공통 키: 허브 케이스 ID, 권한 번호(RMA/RTV 번호), 원주문·원출고 참조, 시리얼, 사유 코드, 반품송장 번호.
- 이벤트마다 `보고 주체`와 `직접 보고/추론` 구분을 둡니다.

### 경로 A: 창고 반품 경로 (고객 → 택배 → 3PL WMS)

| #   | 이벤트                     | 보고 주체                                                 | 비고                            |
| --- | -------------------------- | --------------------------------------------------------- | ------------------------------- |
| A1  | 반품 승인/접수             | OMS·마켓플레이스·CS                                       | 계획 경로 기록                  |
| A2  | 회수 요청 및 반품송장 발번 | 3PL 또는 OMS                                              | 접수 직후 송장 없음 허용        |
| A3  | 택배 회수(집하)            | 택배사                                                    | 회수 못 함(`상품회수불가`) 포함 |
| A4  | 운송 중 및 도착            | 택배사                                                    |                                 |
| A5  | 창고 반품 입고             | 3PL WMS                                                   | 수량·시리얼                     |
| A6  | 검수 결과                  | 3PL WMS                                                   | 선택 이벤트(파트너에 따라 없음) |
| A7  | Disposition 판정           | 판정 역할(판매자, 3PL 규칙, 제조사 중 계약에 따름)        | 판정자 역할 필수 기록           |
| A8  | Disposition 실행           | WMS(재고 전환, 폐기 반출) 또는 출고(RTV, 서비스센터 이송) | 이후 경로 B·C로 분기            |
| A9  | 환불/크레딧                | OMS·ERP                                                   |                                 |

### 경로 B: 서비스센터 경로 (고객 → 서비스센터)

| #   | 이벤트                                                                 | 보고 주체        | 비고                            |
| --- | ---------------------------------------------------------------------- | ---------------- | ------------------------------- |
| B1  | AS 접수                                                                | AS 시스템        |                                 |
| B2  | 센터 도착(방문 또는 택배)                                              | 택배사 또는 센터 |                                 |
| B3  | 센터 입고·접수번호                                                     | 서비스센터       |                                 |
| B4  | 진단/DOA 판정                                                          | 서비스센터       | 판정서 번호 포함                |
| B5  | 해결 유형: 수리 후 반송, 교체, 환불 근거 제공(판정서), 센터 폐기, 리퍼 | 서비스센터       | 소매 창고 재고와 무관할 수 있음 |
| B6  | 고객에게 반송 또는 인도                                                | 택배사 또는 센터 |                                 |
| B7  | 교체품 출고(필요 시)                                                   | 소매 WMS         | 재고 영향은 여기서만 발생       |

### 경로 C: 직접 RTV 경로 (창고 재고 또는 고객 → 제조사)

| #   | 이벤트                        | 보고 주체             | 비고                              |
| --- | ----------------------------- | --------------------- | --------------------------------- |
| C1  | RTV 승인(제조사 RMA 번호)     | 구매 담당 또는 제조사 |                                   |
| C2  | RTV 출고 준비(불량 재고 차감) | 3PL WMS               | 일괄/건별 구분 필드               |
| C3  | 제조사로 발송                 | 택배사 또는 3PL       |                                   |
| C4  | 제조사 인도                   | 택배사                |                                   |
| C5  | 제조사 수령·검사 결과         | 제조사(보고 약함)     | 수기 또는 문서 입력 대비          |
| C6  | 크레딧/교체품 수령            | 재무·구매             | RMA 번호로 대조                   |
| C7  | 변형: 고객 → 제조사 직송      | 택배사(양단)          | 우리 창고 이벤트 없음(SAP 0007형) |

### Disposition 기록 위치 옵션

- **옵션 1: 실행자 기록형.** 창고·센터·제조사가 보고한 처분 결과만 기록합니다. 구현은 단순하지만 "누가 결정했는가"가 남지 않고, 검수·판정 이벤트가 없는 파트너는 공백이 됩니다.
- **옵션 2: 허브 보유 판정 레코드형.** 허브에 `판정 레코드(판정 역할, 근거, 시각)`를 두고 파트너의 실행 이벤트를 연결합니다. 감사성과 분쟁 대응이 좋지만, 판정 정보를 누가 입력하는지(수기/연동)를 정해야 합니다.
- **옵션 3: 2단계형.** 파트너가 "제안/1차 판정"을 보고하고 소유자(판매자 또는 구매 담당)가 "확정"하는 구조입니다. SAP의 계획 후속 활동과 검사 후 확정 구조에 가장 가깝지만 운영 부담이 큽니다.

선택 기준은 위 "사용자 확인" 항목, 특히 3PL이 검수 결과를 값으로 보고하는지와 제조사 계약이 현품 반송을 요구하는지에 달렸습니다.

---

주요 원문 위치:

- Rogers & Tibben-Lembke 1998: 로컬 추출본(`rogers.txt`, 커밋하지 않음)
- SCOR DS 및 GS1 CBV: 로컬 추출본(`scor_guide.txt`, `cbv.txt`, `scor6.txt`, 커밋하지 않음)
