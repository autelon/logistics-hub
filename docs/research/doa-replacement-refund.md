## DOA(초기불량) 교체 vs 환불 결정 — 주요 시스템 모델링 조사 보고

범례: **[검증]** = 1차 문서 본문을 직접 읽고 확인 / **[추론]** = 문서에서 직접 쓰지 않았으나 구조상 도출 / **[미확인]** = 직접 읽지 못함

---

### 1. SAP S/4HANA / ERP — Advanced Returns Management (ARM) 및 고전 SD 반품

**출처(직접 열람)**

- ARM 개요: https://help.sap.com/docs/SAP_ERP/78e0627c34ef43879d72718e21ea517b/ef17554b70b946e588cf4fb378fa4622.html
- Returns Order: https://help.sap.com/docs/SAP_ERP/78e0627c34ef43879d72718e21ea517b/e39b7fc41e21465498820a32fe158821.html
- Material Inspection in the Warehouse: https://help.sap.com/docs/SAP_ERP/78e0627c34ef43879d72718e21ea517b/530018c2f7834bf694660554efbb9dd7.html
- Compensation for Customer Returns: https://help.sap.com/docs/SAP_ERP/78e0627c34ef43879d72718e21ea517b/fa31342caecc459b8775334f881deb08.html
- S/4HANA Cloud "Customer Compensation": https://help.sap.com/docs/SAP_S4HANA_CLOUD/a376cd9ea00d476b96f18dea1247e6a5/436368e8646443988837608bb121e92d.html
- 고전 SD "Creating Returns": https://help.sap.com/docs/SAP_ERP/78e0627c34ef43879d72718e21ea517b/8f65b65334e6b54ce10000000a174cb4.html
- Free-of-Charge Subsequent Delivery: https://help.sap.com/docs/SAP_ERP/78e0627c34ef43879d72718e21ea517b/8365b65334e6b54ce10000000a174cb4.html

**1-a. 고전 SD 반품 흐름 [검증]**

- 문서 유형 **RE(Returns)** 로 반품 오더 생성(선행 오더/송장 참조 가능). 반품 납품(returns delivery)으로 입고 → 검사 후 "승인(빌링 블록 해제) → 대변 메모" 또는 "거절(reason for rejection)".
- 교체 결정 방식: _"If the customer is to receive replacement goods, do not create a credit memo. You can enter a reason for rejection for the appropriate items in the return. You then create a free of charge subsequent delivery with reference to the return."_ 즉 고전 흐름에서 교체는 **반품 아이템에 거절사유를 넣고, 반품을 참조해 무상 후속납품(SDF, 문서유형 SD) 을 별도 생성**하는 방식. 전용 "교체/환불" 필드는 없음.

**1-b. ARM 흐름 [검증]**
결정은 **반품 오더 아이템의 "Returns" 탭** 에 있는 필드로 포착된다:

| 필드                                                                   | 의미                                                                                                                                                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Return Reason                                                          | 반품 사유                                                                                                                                                                                                    |
| Material Received 체크박스                                             | 카운터 반품 등 이미 수령 여부                                                                                                                                                                                |
| Inspection Code (+comment, Insp. at Customer Site)                     | 검사 결과                                                                                                                                                                                                    |
| **Follow-Up Activity (logistical follow-up activity, 코드 0001~0031)** | 불량품의 물리적 처리 = **disposition**                                                                                                                                                                       |
| **Refund(ing) Type**                                                   | **Credit Memo** 또는 **Replacement Material(Product)** = **resolution**                                                                                                                                      |
| **Refund Control**                                                     | I Immediately / P Approved(Create credit memo request·Create replacement order) / R By Credit Memo Request(Cloud 명칭 "Decide later") / A After Receipt of Credit Memo / (Cloud) N No Refund — "언제·어떻게" |
| Refund Code                                                            | 환불 비율(가격결정 파라미터, 예: 70% 환급)                                                                                                                                                                   |
| Replacement Material / Replacement Quantity / Supplying Plant          | 교체품 지정(원래 자재와 달라도 되고, 공급 플랜트도 수령 플랜트와 달라도 됨)                                                                                                                                  |
| Approval Block                                                         | 수령 플랜트 권한자 승인 블록                                                                                                                                                                                 |

Follow-Up Activity 표준 코드(반품 오더에서): 0001 Receive into Plant, 0002 Immediately Move to Free Available Stock, 0003 Immediately Move to Scrap, 0004 Ship to Other Plant, 0005 Ship to Vendor, 0006 Ship to Vendor via Other Plant, 0007 Direct Shipment to Vendor, 0008 Inspection at Customer Site, 0009 Materials Still Unknown, 0013 Material Remains at Customer Site, 0014 Move to Specified Stock, 0016 In-House Repair, 0017 External Repair, 0021 Send Back to Customer. 창고 검사 트랜잭션에서는 0011 Transfer to Free Available Stock, 0012 Transfer to Scrap, 0015, 0018 Transfer to Scrap for Customer, 0031 No Further Activities 등.

**누가 / 언제 결정하는가 [검증]**

- 결정 지점은 3곳이며 문서가 명시적으로 열거: _"You can trigger compensation at any time either right in the returns order, in the Material Inspection in Warehouse transaction, or via the Customer Refund Determination transaction."_
- 역할: _"sales representative, warehouse manager, warehouse worker, returns manager, returns controller, accounts payable clerk, and inventory manager"_ 각 단계에 권한 부여 가능.
- 반품 오더 입력 시 **영업 담당(sales representative)** 이 "어떻게·언제 보상할지" 지정: _"In the returns order, sales representatives specify how and when the customer should be compensated: Even if a sales representative specifies that the customer should be compensated at a later time, he or she can still specify the refund amount or replacement material."_ 즉 **Refund Type=Replacement 는 '고객 희망'으로 먼저 기록되고, Refund Control=R 이면 최종 승인은 뒤로 미뤄진다**: _"The refunding type Replacement Material that is specified in the returns order is displayed in both of these transactions so that the person making the next decision knows that the customer would like a replacement material."_
- 창고 검사(트랜잭션 MSR_INSPWH, Cloud 앱 "Enter Inspection Results – From Warehouse")에서 **검사자/창고관리자** 가 inspection code 입력 → follow-up activity 확정 → 같은 화면에서 credit memo request 또는 SDF 를 **release** 할 수 있음. 검사 프로파일로 "제안만 가능 / 확정 가능" 활동을 역할별로 분리(예: 검사자는 폐기(0012)를 제안만, 창고관리자가 확정).
- 환불 결정 트랜잭션(MSR_CRD "RRD for Customer Returns", Cloud "Manage Customer Returns – Version 2 > Determine Refund")에서 **returns controller** 가 검사 결과·사유를 보고 refund code 입력 → credit memo request, 또는 replacement material/qty/plant 입력 → SDF 생성. 환불 거부는 credit memo request 에 **rejection reason** 을 넣어 표현(완료 처리를 위해 필요).
- 반품 오더에서 직접 release 하면 credit memo 또는 SDF 가, 환불 결정 트랜잭션에서 release 하면 credit memo **request** 또는 SDF 가 생성됨.
- "보상은 통상 검사 후": _"since compensation usually depends on the inspection results, the customer is usually compensated after the returned material has been inspected."_

**선교체(advance replacement) 개념 [검증]**: Refund Type=Replacement + Refund Control I/P 는 _"even if you have not yet received the material being returned"_ SDF 생성 가능. Cloud 문서는 "suspend product valuation until final logistical follow-up activity is confirmed" 옵션을 두어, 급한 고객에게 교체품을 먼저 승인하되 **소유권 이전(재고 평가)은 검사 결과까지 보류**할 수 있게 함(Refund Control P + Follow-Up 0001 조합).

**재고 연계 [검증]**: 환불/교체 결정(credit memo, 빌링블록 없는 credit memo request, SDF) 자체가 **소유권 이전 → 비평가 반품재고를 평가재고로 전환하는 goods movement** 를 트리거. 또는 0002/0003/0014 같은 소유권 변경 follow-up 활동으로도 전환.

**원 주문라인과의 연결 [검증]**: 반품 오더는 선행 판매오더/빌링문서 참조로 생성 → SDF/credit memo request 는 반품 오더 아이템을 참조해 생성("with reference to the relevant returns order item"). 즉 **원주문 라인 ← 반품오더 아이템 ← SDF 아이템/대변메모요청 아이템** 의 문서흐름(document flow).

---

### 2. SAP Service (CRM 서비스 / S/4HANA Service In-House Repair)

**출처(직접 열람)**

- CRM Complaints and Returns: https://help.sap.com/docs/SAP_CUSTOMER_RELATIONSHIP_MANAGEMENT/ccd297fc53c04ef8b3d7abbfc301c40f/4640a420a4185fa9e10000000a1553f7.html
- CRM Complaint Creation: https://help.sap.com/docs/SAP_CUSTOMER_RELATIONSHIP_MANAGEMENT/ccd297fc53c04ef8b3d7abbfc301c40f/46010b0318cf3482e10000000a1553f6.html
- CRM Complaints with Integration in ERP ARM: https://help.sap.com/docs/SAP_CUSTOMER_RELATIONSHIP_MANAGEMENT/ccd297fc53c04ef8b3d7abbfc301c40f/a94cf641ea7a497cae3fee1c251af1c8.html
- S/4HANA Cloud In-House Repair: https://help.sap.com/docs/SAP_S4HANA_CLOUD/adbae5bcd5994f159bf2847a11397b61/f437d220829a4334976cd81c3b055a04.html
- Perform Prechecks: https://help.sap.com/docs/SAP_S4HANA_CLOUD/adbae5bcd5994f159bf2847a11397b61/f76b69ede70d47ce8edea731a17c41c6.html
- Create In-House Repairs in Customer Returns: https://help.sap.com/docs/SAP_S4HANA_CLOUD/adbae5bcd5994f159bf2847a11397b61/86bdee0c2d7a48c9acec9e0ff382f9ec.html

**2-a. CRM 서비스 클레임(Complaint) [검증]**

- 거래유형 **CRMC – Complaint**, 아이템 카테고리: **COMP**(메인) 아래 서브아이템 **G2N Credit Memo Request / L2N Debit Memo Request / TANN Free of Charge Substitute Delivery / REN Return Request**.
- 아이템 액션(COMPLAINT_ITEM 액션 프로파일): **CREDIT / DEBIT / RETURN_REQ / SUBST_DEL**. 즉 **서비스 시스템의 클레임 문서에서 "대변 vs 대체납품 vs 반품요청"을 서브아이템으로 생성하는 것이 곧 결정**이며, 액션은 수동 또는 규칙(Investigation 워크플로: research/analysis/approval) 으로 트리거.
- 보증 체크: _"If, for example, the warranty allows a refund in the case of a defective product, you can immediately create a credit memo."_
- e-service 에서는 고객이 기대 반응(credit memo / substitute delivery)을 직접 지정 가능.
- 시리얼 번호 입력·검증 지원(serialized unit 추적).
- ARM 통합: return request 아이템을 **Released** 상태로 바꾸면 ERP 에 반품 오더가 자동 생성되며, CRM 아이템의 **Follow-Up Activity, Refund Type, Refund Control** 값이 ERP 로 전달되어 후속 문서(returns delivery, goods receipt, inspection, credit memo request/credit memo, in-house/external repair 등)가 만들어지고 CRM 의 "ERP Returns Overview" 블록에 회신됨. → **서비스 시스템이 결정값을 들고, 실행과 상태는 ERP(주문/재고)가 되돌려 주는 구조.**

**2-b. S/4HANA Service In-House Repair [검증]**

- 흐름: Trigger customer returns → Enter repair objects → **Perform precheck** → Plan/Perform diagnosis → Repair quotation → Plan/Perform repair → Prepare for billing → Outbound delivery.
- Precheck 단계의 결정 옵션은 **Quotation / Create Repair Order(또는 Fixed Price Repair Order) / Set Repair Object to Completed(반송 또는 종료)**. 즉 In-House Repair 자체는 "수리 vs 반송" 결정이지 "교체 vs 환불" 결정이 아님.
- 교체/환불 결정은 **반품 오더(Claims, Returns, and Refund Management) 쪽**에 있음: 반품 오더에서 Follow-Up Activity **In-House Repair (Service)** + Refund Control **No Refund** 를 고르면 수리 프로세스로, Receive into Plant + **Decide later** 를 고르면 검사 후 결정. 수리 불가로 판단되어 교체/환불로 바꾸려면 Determine Refund 페이지에서 credit memo request 또는 SDF 를 생성 [검증: Customer Compensation 문서의 "No Refund … If you later change your mind…" 구절].
- 시리얼 제약: In-House Repair 는 시리얼 번호가 있고 serialization procedure **ADVR** 인 장비(equipment)만 처리.
- "Advance exchange"라는 명시적 명칭은 S/4HANA Service 문서에서 찾지 못함 **[미확인]**. 기능적으로는 ARM 의 Replacement + Refund Control P/I(+valuation suspend)가 그 역할을 한다 **[추론]**.

---

### 3. 비교 시스템

**3-a. Microsoft Dynamics 365 Supply Chain Management [검증]**

- 출처: https://learn.microsoft.com/en-us/dynamics365/supply-chain/sales-marketing/sales-returns , https://learn.microsoft.com/en-us/dynamics365/supply-chain/sales-marketing/specify-how-to-dispose-of-returned-items , https://learn.microsoft.com/en-us/dynamics365/supply-chain/sales-marketing/register-the-receipt-of-returned-items
- 객체: **Return order** = 오더 타입 "Returned order"인 판매오더, 키는 **RMA number**. 라인은 **Find sales order** 로 송장 처리된 판매라인을 참조(원가·수량 검증). **Replacement order** 는 별도 판매오더이며 _"Both sales orders link to the originating RMA number."_
- 필드: **Return reason code**(헤더, 왜), **Disposition code**(라인) → 반드시 6개 내장 **Disposition action** 중 하나 참조: **Credit / Credit only / Scrap / Replace and credit / Replace and scrap / Return to customer**. 액션이 (1) 재무 영향(고객 대변 여부·수수료), (2) 반품품 처분(재고 복귀/폐기/고객 반송), (3) 교체 발송 여부를 **한꺼번에** 결정.
- 결정 시점/주체: _"An important step in the return order process is assigning a disposition code to the return order line as part of arrival registration."_ 코드는 반품오더 생성 시, **arrival journal 등록 시(warehouse arrival clerk)**, 또는 **quarantine order 종료 시(검사자)** 에 부여. 검사(quarantine)로 보낸 라인은 arrival 시점에 코드를 넣을 수 없고 검사 결과로 코드가 정해지며, 이후 변경 불가.
- 실행 시점: disposition 은 **packing slip 생성 시 커밋**됨(폐기 전기, 재고 입고, 교체 판매오더 생성). 교체 라인 내용은 **Replacement item** 페이지에서 입력(동일 품목 기본, 다른 품목·수량 허용).
- 선교체: **Up-front replacement** — 반품 수령 전 반품오더에서 수동 생성하는 독립 판매오더. 생성하면 이후 "replace" 계열 disposition 선택 불가(이중 교체 방지).
- 마감: 송장(credit note) 생성 시 반품오더 Closed. 송장은 Sales order 페이지에서 처리(재무 담당이 판매오더와 함께 처리).

**3-b. Oracle NetSuite [검증]**

- 출처: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1304530.html (RMA forms), https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1310133.html (statuses), https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_40150958866.html (Returning and Replacing), https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4391750423.html (Creating a Warranty Claim), https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4391753773.html , https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/bridgehead_3938326430.html
- 기본 RMA: 판매오더에서 **Authorize Return** → **Return Authorization**(non-posting) → **Approve Return** → **Receive(Item Receipt**, 시리얼 입력) → **Refund**(credit memo) 또는 **Create Replacement Sales Order**(item receipt 생성 후에만 버튼 활성). 폼 선택이 환불 형태를 고정: **Standard Return Authorization – Credit**(credit memo, 이후 잔액 적용 또는 환불) vs **– Cash**(현금 환불, 나중에 credit memo 로 전환 불가). 상태: Pending Approval → Pending Receipt → Partially Received → Pending Refund → Refunded / Closed / Canceled.
- Warranty and Repairs Management SuiteApp: **Warranty Claim** 레코드의 **Action** 필드가 **Refund / Replacement / Repair / Void** — _"Refund: Select this action when an item can't be repaired or replaced under warranty, and the customer gets a credit memo."_ 즉 **고객서비스가 클레임 생성 시점에 resolution 을 결정**하고, 이후 RMA → item receipt → Action 에 따라 **Create SO**(교체, 금액 0) 또는 **Refund**(credit memo). 환경설정 **Ship Replacement in Advance**(수령 전 교체 SO 생성 허용), **Close RMA Upon SO Creation**. 교체 SO 는 RMA 의 **Replacement SO No.** 필드와 **Created From** 으로 연결.
- NetSuite 에는 D365 식 "disposition" 개념이 기본 RMA 에 없음(item receipt 로 재고 복귀; 폐기는 별도 inventory adjustment) **[추론: 문서에 폐기 필드 언급 없음]**.

**3-c. Shopify 등 커머스 반품 흐름 [미확인]** — 이번 조사에서 1차 문서를 읽지 않음.

---

### 4. 한국 소비자분쟁해결기준 (전자제품 초기불량) [검증 — 국가법령정보센터 원문 이미지 직접 열람]

- 고시: **소비자분쟁해결기준 [공정거래위원회고시 제2025-14호, 2025.12.18. 일부개정, 시행 2025.12.18.]** https://www.law.go.kr/행정규칙/소비자분쟁해결기준 — 제1조(목적): 「소비자기본법」 제16조 제2항·시행령 제8조 제3항에 따라 "구체적인 **합의 또는 권고의 기준**" (강행규정 아님).
- **별표 Ⅱ 품목별 해결기준 › 5. 공산품 › ① 전자제품, 사무용기기 (2-1)**:
  1. 구입 후 **10일 이내**에 정상적인 사용 상태에서 발생한 성능·기능상의 하자로 **중요한 수리를 요할 때** → **제품교환 또는 구입가 환급**
  2. 구입 후 **1개월 이내** … 중요한 수리를 요할 때 → **제품교환 또는 무상수리**
  3. 품질보증기간 이내 … 하자발생 시 → 무상수리 / 수리불가능 시 → 제품교환 또는 구입가 환급 / 교환불가능 시 → 구입가 환급 / **교환된 제품이 1개월 이내에 중요한 수리를 요할 때 → 구입가 환급** / 품질보증기간 경과 후 수리불가 시 → 정액감가상각 금액에 10% 가산 환급
     (비고: 동일하자 2회 수리 후 재발, 여러 부위 하자 4회 수리 후 재발 시 수리불가능으로 봄)
  4. 제품구입 시 운송과정에서 발생된 피해 → 제품교환
- **소비자기본법 시행령 [별표 1] 일반적 소비자분쟁해결기준** (https://www.law.go.kr/법령/소비자기본법시행령): "라. **교환은 같은 종류의 물품등으로 하되**, 같은 종류의 물품등으로 교환하는 것이 불가능한 경우에는 같은 종류의 유사물품등으로 교환한다. 다만, … 불가능하고 **소비자가 같은 종류의 유사물품등으로 교환하는 것을 원하지 아니하는 경우에는 환급**한다." / "바. 환급금액은 거래 시 교부된 영수증 등에 적힌 물품등의 가격을 기준으로 한다."
- **누가 교환/환급을 고르는지는 고시에 명시되지 않음** **[검증: 원문에 "또는"만 기재]**. "교체가 기본, 환불도 가능"이라는 오너 정책은 일반기준 "라"(교환 우선, 불가·거부 시 환급)와 방향이 일치 **[추론]**. 10일/1개월 경계는 **구입일 기준 시간 조건**이므로, 우리 모델에서 resolution 결정 시 "구입일 + 경과일 + 중요한 수리 여부" 가 결정 근거 데이터가 됨 **[추론]**.

---

### 5. 비교표

| 시스템                      | 결정 지점                                                                                    | 결정 주체(역할)                                                                                                      | disposition / resolution 분리                                                       | 교체 ↔ 원 주문라인 연결                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| SAP 고전 SD(RE)             | 반품 수령·검사 후 빌링블록 해제                                                              | 영업/반품 담당                                                                                                       | 부분적(재고 전기 vs 대변메모/SDF는 별도 문서)                                       | 반품(RE)이 오더/송장 참조 → SDF가 RE 참조                                                |
| SAP ARM                     | 3곳: 반품오더 입력 / 창고 검사 / 환불결정(MSR_CRD) — "Decide later"로 미룰 수 있음           | 영업담당(제안·입력) → 검사자/창고관리자(검사·follow-up 확정, 보상 release 가능) → returns controller(최종 환불 결정) | **예**: Follow-Up Activity(물류 처분) vs Refund Type+Refund Control(보상) 별도 필드 | 반품오더 아이템이 선행 오더/송장 참조, SDF·대변메모요청이 반품오더 아이템 참조           |
| SAP CRM Complaint → ERP ARM | 클레임 아이템 생성/Release 시(서비스) + ERP 검사 후 변경 가능                                | 고객서비스(클레임 액션 CREDIT/SUBST_DEL/RETURN_REQ; 규칙·승인 워크플로)                                              | **예**(Refund Type/Control + Follow-Up Activity 가 클레임 아이템에 존재)            | 클레임이 ERP 판매오더/빌링문서 참조, ERP 반품오더가 자동 생성·회신                       |
| SAP S/4 In-House Repair     | Precheck(수리/견적/종료) — 교체·환불은 반품오더 측                                           | 수리센터 담당                                                                                                        | 예(수리 follow-up 은 disposition, 보상은 Refund Control)                            | 반품오더 아이템 = repair object, 시리얼 필수                                             |
| D365 SCM                    | **arrival 등록 또는 quarantine 종료 시 disposition code 부여**, packing slip 에서 실행       | 창고 입고 담당 / 검사자 (up-front replacement 는 반품오더 담당이 수동)                                               | **아니오(통합)**: disposition action 하나가 재무·처분·교체를 동시 결정              | Return line → Find sales order 로 송장 라인 참조; 교체오더·반품오더 모두 RMA 번호로 연결 |
| NetSuite RMA                | RMA 생성 시 폼(Credit/Cash)으로 환불 형태 고정; 교체는 item receipt 후 Create Replacement SO | 영업/CS(승인자 별도 가능), 창고가 Receive                                                                            | 약함(처분 개념 없음, 재고 입고만)                                                   | RMA 가 판매오더에서 Authorize Return 으로 생성, 교체 SO 는 Created From=RMA              |
| NetSuite Warranty Claim     | **클레임 생성 시 Action(Refund/Replacement/Repair)**                                         | 고객서비스                                                                                                           | 아니오(Action 이 resolution 전용, 처분은 별도)                                      | 클레임 → RMA → Replacement SO No.                                                        |
| 한국 소비자분쟁해결기준     | 구입일로부터 10일/1개월 경계 + "중요한 수리" 판정                                            | 명시 없음(사업자·소비자 합의/권고)                                                                                   | 해당 없음                                                                           | 해당 없음                                                                                |

공통 패턴 [추론]: (1) 반품/클레임 **아이템**이 결정 단위이고 원 주문라인을 참조한다. (2) 교체는 항상 **별도 출고 문서**(SAP SDF, D365 replacement sales order, NetSuite replacement SO)로 생기며 금액 0 또는 무상이다. (3) 성숙한 모델(SAP ARM, D365)은 **"결정값 기록"과 "실행 커밋"의 시점을 분리**한다(SAP Refund Control, D365 packing slip). (4) 선교체는 "수령 전 교체 승인 + 소유권/평가 보류" 플래그로 다룬다.

---

### 6. 우리 모델에 대한 시사점 — 후보 설계(추천 아님, 오너 결정)

전제: 우리 시스템은 파트너 시스템이 보고하는 사실을 기록하는 가시성 시스템이므로 "결정을 내리는" 게 아니라 **"누가·언제·어느 시스템에서 결정했는지"를 손실 없이 기록**하는 것이 목표 [추론].

**설계 A — 서비스 시스템이 DOA 확인과 동시에 resolution 을 결정 (NetSuite Warranty Claim / CRM Complaint 액션 방식)**

- 이벤트: `DOAConfirmed { unit_serial, order_line_ref, resolution: REPLACE|REFUND, decided_by: SERVICE, basis: {purchase_date, days_since_purchase, major_repair_required} }`
- 이후 주문 시스템은 `ReplacementShipmentCreated{ref: order_line, return_ref}` 또는 `OrderLineClosed{credit_ref}` 를 보고, 재고 시스템은 `ReturnReceived` → `Disposition{SCRAP|RTV|RESTOCK}` 를 **독립적으로** 보고.
- 장점: 결정 지점이 하나라 추적 단순; "교체 기본" 정책을 서비스 규칙으로 내재화 가능; 10일/1개월 판정이 DOA 확인 시점 데이터와 같이 남음.
- 단점: 반품 실물 검사 전에 결정이 확정되어 번복(검사 결과 고객 과실 등) 시 보정 이벤트가 필요; SAP 의 "sales rep 는 제안, controller 가 확정" 같은 권한 분리를 표현할 수 없음.

**설계 B — resolution 은 주문 시스템이 반품 수령/검사 후 확정, 서비스 시스템은 DOA 사실만 보고 (SAP ARM "Decide later" / D365 disposition-at-arrival 방식)**

- 이벤트: `DOAConfirmed{...}`(resolution 없음) → `ReturnReceived`/`InspectionRecorded{inspection_code}`(재고) → `ResolutionDecided { resolution, decided_by: ORDER, inspection_ref }`(주문) → `ReplacementShipmentCreated` 또는 `OrderLineClosed`.
- 장점: 검사 결과에 근거한 결정·소유권 이전 시점이 명확(SAP 가 환불 결정 = 재고 평가 트리거로 보는 것과 정합); 번복이 적음.
- 단점: 고객 응대 시점과 결정 시점이 분리되어 "고객에게 뭘 약속했는지"가 모델에 없음; 선교체(DOA 당일 교체 발송) 를 표현하려면 별도 예외 경로 필요.

**설계 C — 2단계: '요청된 resolution'(서비스) 과 '확정된 resolution'(주문) 을 별도 이벤트로 기록, disposition 은 재고가 독립 보고 (SAP ARM Refund Type + Refund Control 을 그대로 본뜬 방식)**

- 이벤트: `DOAConfirmed { requested_resolution: REPLACE|REFUND|UNDECIDED, advance_replacement: bool }` → (선택) `ReplacementShipmentCreated{advance: true, ownership_transfer: PENDING}` → `InspectionRecorded` → `ResolutionFinalized { resolution, decided_by, decision_stage: AT_SERVICE|AT_INSPECTION|AT_REFUND_DETERMINATION }` → `DispositionRecorded{SCRAP|RTV|RESTOCK|RETURN_TO_CUSTOMER}`.
- 장점: 세 시스템의 책임이 1:1 로 대응(서비스=요청/근거, 주문=확정/이행, 재고=처분); 선교체·번복·"교환 후 1개월 내 재불량 → 환급" 같은 한국 기준의 연쇄도 표현 가능; SAP/D365 양쪽 파트너 데이터를 매핑하기 쉬움.
- 단점: 이벤트 수와 상태 조합이 늘어남; 시리얼 단일 유닛이라 분할(split)은 없지만 "요청≠확정" 불일치 해소 규칙이 필요; 가시성 시스템이 결정 로직을 흉내 낸다고 오해될 위험.

**공통으로 필요한 데이터(검증된 시스템에서 공통) [추론]**: 반품/클레임 레코드 ID, 원 주문라인 참조, 유닛 시리얼, 검사 코드/근거, 결정 주체(시스템+역할), 결정 단계, 교체 출고 문서 참조(원 라인·반품 레코드 양쪽 링크), 환불 문서 참조 또는 거절 사유, 처분 코드(폐기/RTV/재입고/고객반송), 소유권 이전 시점.

**미확인/추가 조사 후보**: Shopify 반품 API 의 resolution/disposition 구조; S/4HANA Service 의 "advance exchange" 전용 명칭 존재 여부; 소비자분쟁해결기준 상 교환·환급 선택권의 실무 해석(공정위 해설서).
