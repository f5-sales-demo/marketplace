import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { booleanLabels, canonicalBooleanValue } from './display-words';
import { generateWorkbook, planWorkbook } from './generate';
import { canonicalEnumValue, enumLabels } from './labels';
import {
  ENGLISH_LOCALE,
  type LocaleContext,
  loadLocale,
  localeContextFromCatalogue,
  localeSourceHash,
  localize,
  SHIPPED_LOCALES,
} from './locale';
import { readWorkbook, readWorkbookProperty } from './read-workbook';
import { translatableSet } from './translatable';
import type { WorkbookSpec } from './workbook-spec';
import { readZip } from './zip';

const here = import.meta.dir;
const schema = JSON.parse(fs.readFileSync(path.join(here, '..', 'schema', 'meddpicc-schema.json'), 'utf8'));
const spec = JSON.parse(fs.readFileSync(path.join(here, 'workbook-spec.json'), 'utf8')) as WorkbookSpec;
const deal = JSON.parse(fs.readFileSync(path.join(here, '..', 'schema', 'example-deal.json'), 'utf8'));
const japanese = () => loadLocale({ slug: 'ja', from: 'flag' }, spec, schema);
const remainingLocaleSlugs = ['fr', 'es', 'de', 'pt-br', 'ko', 'zh-cn', 'zh-tw', 'it', 'hi', 'th'] as const;
const identityTerms = ['Positive', 'Negative', 'Neutral', 'Unknown', 'Red', 'Yellow', 'Green'] as const;
const salesTermsByLocale = {
  fr: {
    ACV: 'Valeur annuelle du contrat (ACV)',
    'Assigned To Deal?': 'Affecté à l’opportunité ?',
    'Below Three': 'Moins de trois',
    'Can Say No': 'Peut dire non',
    'Can Say No?': 'Peut dire non ?',
    'Stage Name': 'Nom de l’étape commerciale',
    Pipeline: 'Pipeline commercial',
    'Factored Pipeline': 'Pipeline commercial pondéré',
    Salesforce: 'Salesforce',
    No: 'Non',
    'Close Plan': 'Plan de clôture',
    Hardware: 'Matériel informatique',
    Qualification: 'Qualification de l’opportunité',
    Commit: 'Engagement',
    Change: 'Variation',
    'Days To Close': 'Jours avant clôture',
    'Must Say Yes': 'Approbation indispensable',
    'Must Say Yes?': 'Son approbation est-elle indispensable ?',
    'Win Probability': 'Probabilité de succès',
  },
  es: {
    'Assigned To Deal?': '¿Asignado a la oportunidad?',
    'Below Three': 'Menos de tres',
    'Can Say No': 'Puede decir que no',
    'Can Say No?': '¿Puede decir que no?',
    'Stage Name': 'Nombre de la etapa de ventas',
    Pipeline: 'Pipeline de ventas',
    'Factored Pipeline': 'Pipeline de ventas ponderado',
    Salesforce: 'Salesforce',
    No: 'No',
    'Close Plan': 'Plan de cierre',
    Hardware: 'Equipos informáticos',
    Qualification: 'Calificación de la oportunidad',
    Commit: 'Compromiso',
    Change: 'Cambio',
    'Days To Close': 'Días hasta el cierre',
    'Must Say Yes': 'Aprobación imprescindible',
    'Must Say Yes?': '¿Su aprobación es imprescindible?',
    'Win Probability': 'Probabilidad de éxito',
  },
  de: {
    'Assigned To Deal?': 'Der Opportunity zugewiesen?',
    'Below Three': 'Unter drei',
    'Can Say No': 'Kann Nein sagen',
    'Can Say No?': 'Kann Nein sagen?',
    'Stage Name': 'Name der Vertriebsphase',
    Pipeline: 'Vertriebspipeline',
    'Factored Pipeline': 'Gewichtete Vertriebspipeline',
    Salesforce: 'Salesforce',
    No: 'Nein',
    'Close Plan': 'Abschlussplan',
    Hardware: 'IT-Hardware',
    Qualification: 'Vertriebsqualifizierung',
    Commit: 'Commit',
    Change: 'Veränderung',
    'Days To Close': 'Tage bis zum Abschluss',
    'Must Say Yes': 'Zustimmung erforderlich',
    'Must Say Yes?': 'Ist die Zustimmung erforderlich?',
    'Win Probability': 'Abschlusswahrscheinlichkeit',
  },
  'pt-br': {
    'Assigned To Deal?': 'Atribuído à oportunidade?',
    'Below Three': 'Menos de três',
    'Can Say No': 'Pode dizer não',
    'Can Say No?': 'Pode dizer não?',
    'Stage Name': 'Nome da etapa de vendas',
    Pipeline: 'Pipeline de vendas',
    'Factored Pipeline': 'Pipeline de vendas ponderado',
    Salesforce: 'Salesforce',
    No: 'Não',
    'Close Plan': 'Plano de fechamento',
    Hardware: 'Equipamentos de TI',
    Qualification: 'Qualificação da oportunidade',
    Commit: 'Compromisso',
    Change: 'Variação',
    'Days To Close': 'Dias até o fechamento',
    'Must Say Yes': 'Aprovação obrigatória',
    'Must Say Yes?': 'A aprovação é obrigatória?',
    'Win Probability': 'Probabilidade de sucesso',
  },
  ko: {
    'Assigned To Deal?': '영업 기회에 배정되었나요?',
    'Below Three': '3 미만',
    'Can Say No': '거절할 수 있음',
    'Can Say No?': '거절할 수 있나요?',
    'Stage Name': '영업 단계명',
    Pipeline: '영업 파이프라인',
    'Factored Pipeline': '가중 영업 파이프라인',
    Salesforce: 'Salesforce',
    No: '아니요',
    'Close Plan': '영업 마감 계획',
    Hardware: '하드웨어',
    Qualification: '영업 기회 검증',
    Commit: '확정',
    Change: '변화',
    'Days To Close': '영업 마감까지 남은 일수',
    'Must Say Yes': '승인 필수',
    'Must Say Yes?': '승인이 필수인가요?',
    'Win Probability': '수주 확률',
  },
  'zh-cn': {
    'Assigned To Deal?': '已分配到此商机？',
    'Below Three': '低于 3',
    'Can Say No': '有权否决',
    'Can Say No?': '有权否决吗？',
    'Stage Name': '销售阶段名称',
    Pipeline: '销售机会管道',
    'Factored Pipeline': '加权销售管道',
    Salesforce: 'Salesforce',
    No: '否',
    'Close Plan': '成交计划',
    Hardware: '硬件',
    Qualification: '商机资格评估',
    Commit: '承诺',
    Change: '变化',
    'Days To Close': '距成交天数',
    'Must Say Yes': '必须批准',
    'Must Say Yes?': '必须由其批准吗？',
    'Win Probability': '赢单概率',
  },
  'zh-tw': {
    'Assigned To Deal?': '已指派至此商機？',
    'Below Three': '低於 3',
    'Can Say No': '有權否決',
    'Can Say No?': '有權否決嗎？',
    'Stage Name': '銷售階段名稱',
    Pipeline: '銷售機會管道',
    'Factored Pipeline': '加權銷售管道',
    Salesforce: 'Salesforce',
    No: '否',
    'Close Plan': '成交計畫',
    Hardware: '硬體',
    Qualification: '商機資格評估',
    Commit: '承諾',
    Change: '變化',
    'Days To Close': '距成交天數',
    'Must Say Yes': '必須核准',
    'Must Say Yes?': '必須由其核准嗎？',
    'Win Probability': '贏單機率',
    'Quantified business outcomes the client expects — cost reduction, risk reduction, revenue impact, productivity gains, time-to-value':
      '客戶期望的量化業務成果——降低成本、降低風險、營收影響、生產力提升、實現價值所需時間',
    'Quantified — Metrics tied to business value with baseline and target data':
      '量化——透過基準與目標資料將衡量指標連結至業務價值',
    'Quantified — Pain quantified with business impact; consequence of inaction documented':
      '已量化——已量化業務痛點的商業影響；已記錄不採取行動的後果',
  },
  it: {
    'Assigned To Deal?': "Assegnato all'opportunità?",
    'Below Three': 'Meno di tre',
    'Can Say No': 'Può dire di no',
    'Can Say No?': 'Può dire di no?',
    'Stage Name': 'Nome della fase di vendita',
    Pipeline: 'Pipeline di vendita',
    'Factored Pipeline': 'Pipeline di vendita ponderata',
    Salesforce: 'Salesforce',
    No: 'No',
    'Close Plan': 'Piano di chiusura',
    Hardware: 'Apparecchiature informatiche',
    Qualification: "Qualificazione dell'opportunità",
    Commit: 'Impegno',
    Change: 'Variazione',
    'Days To Close': 'Giorni alla chiusura',
    'Must Say Yes': 'Approvazione necessaria',
    'Must Say Yes?': 'La sua approvazione è necessaria?',
    'Win Probability': 'Probabilità di successo',
  },
  hi: {
    'Assigned To Deal?': 'क्या इस अवसर को सौंपा गया है?',
    'Below Three': 'तीन से कम',
    'Can Say No': 'इनकार कर सकते हैं',
    'Can Say No?': 'क्या वे इनकार कर सकते हैं?',
    'Stage Name': 'बिक्री चरण का नाम',
    Pipeline: 'बिक्री पाइपलाइन',
    'Factored Pipeline': 'भारित बिक्री पाइपलाइन',
    Salesforce: 'Salesforce',
    No: 'नहीं',
    'Close Plan': 'सौदा समापन योजना',
    Hardware: 'आईटी हार्डवेयर',
    Qualification: 'अवसर योग्यता',
    Commit: 'पूर्वानुमान प्रतिबद्धता',
    Change: 'परिवर्तन',
    'Days To Close': 'सौदा पूरा होने में शेष दिन',
    'Must Say Yes': 'अनुमोदन आवश्यक',
    'Must Say Yes?': 'क्या उनका अनुमोदन आवश्यक है?',
    'Win Probability': 'सौदा जीतने की संभावना',
  },
  th: {
    'Assigned To Deal?': 'ได้รับมอบหมายให้ดูแลโอกาสการขายนี้หรือไม่?',
    'Below Three': 'น้อยกว่าสาม',
    'Can Say No': 'ปฏิเสธได้',
    'Can Say No?': 'ปฏิเสธได้ไหม?',
    'Stage Name': 'ชื่อขั้นตอนการขาย',
    Pipeline: 'ไปป์ไลน์การขาย',
    'Factored Pipeline': 'ไปป์ไลน์การขายแบบถ่วงน้ำหนัก',
    Salesforce: 'Salesforce',
    No: 'ไม่',
    'Close Plan': 'แผนปิดการขาย',
    Hardware: 'ฮาร์ดแวร์',
    Qualification: 'การคัดกรองโอกาสการขาย',
    Commit: 'ยอดคาดการณ์ที่ยืนยันแล้ว',
    Change: 'การเปลี่ยนแปลง',
    'Days To Close': 'จำนวนวันจนถึงการปิดการขาย',
    'Must Say Yes': 'ต้องได้รับการอนุมัติ',
    'Must Say Yes?': 'ต้องได้รับการอนุมัติจากบุคคลนี้หรือไม่?',
    'Win Probability': 'ความน่าจะเป็นในการชนะ',
  },
} as const satisfies Record<(typeof remainingLocaleSlugs)[number], Readonly<Record<string, string>>>;
const reviewedTermsByLocale = {
  fr: {
    'Account ID': 'Identifiant du compte',
    'Account Name': 'Nom du compte',
    Owner: 'Responsable',
    'Relationship Owner': 'Responsable de la relation',
    'Economic buyer': 'Décideur économique',
    'The compelling business pain that creates urgency to act':
      'Le problème métier critique qui crée l’urgence d’agir',
    'Identified — Pain implied but not explicitly confirmed by customer':
      'Identifié – Problème métier supposé, mais pas explicitement confirmé par le client',
    'Acknowledged — Pain acknowledged by customer but not fully quantified':
      'Reconnu – Problème métier reconnu par le client, mais pas entièrement quantifié',
    'Quantified — Pain quantified with business impact; consequence of inaction documented':
      'Quantifié – Problème métier quantifié en termes d’impact commercial ; conséquences de l’inaction documentées',
    'Urgent — Multiple stakeholders confirm pain; triggering event identified; clear deadline driver':
      'Urgent – Plusieurs parties prenantes confirment le problème métier ; événement déclencheur identifié ; motif clair imposant l’échéance',
    'Unknown — No pain identified or discussed; solution looking for a problem':
      'Inconnu – Aucun problème métier identifié ou discuté ; une solution à la recherche d’un problème',
    'Mobilizing — Champion is actively coaching you, sharing intel, and taking concrete actions weekly':
      'Mobilisation – Le parrain interne vous conseille activement, partage des informations et prend des actions concrètes chaque semaine',
    'Controlled — All gates mapped; no surprises expected; legal/security/procurement flow confirmed':
      'Contrôlé – Tous les jalons d’approbation sont cartographiés ; aucune surprise attendue ; flux juridique, sécurité et approvisionnement confirmé',
    'The procurement mechanics — quotes, approvals, vendor onboarding, security review, legal redlines, signature process':
      'Les mécanismes d’approvisionnement – devis, approbations, intégration des fournisseurs, examen de sécurité, modifications contractuelles proposées et processus de signature',
    'The requirements the customer will use to evaluate options — technical, business, operational, and commercial':
      'Les exigences que le client utilisera pour évaluer les options – techniques, métier, opérationnelles et commerciales',
    'Total Booked Value': 'Valeur totale contractualisée',
    'Why Anything': 'Pourquoi changer',
    '3 Whys — (Why Anything, Why Us, Why Now)':
      '3 Pourquoi – (Pourquoi changer, pourquoi nous, pourquoi maintenant)',
  },
  es: {
    'Account ID': 'ID de cuenta',
    'Account Name': 'Nombre de cuenta',
    Owner: 'Responsable',
    'Relationship Owner': 'Responsable de la relación',
    'Economic buyer': 'Comprador Económico',
    'The compelling business pain that creates urgency to act':
      'El problema de negocio crítico que crea urgencia para actuar',
    'Identified — Pain implied but not explicitly confirmed by customer':
      'Identificado: problema de negocio implícito, pero no confirmado explícitamente por el cliente',
    'Acknowledged — Pain acknowledged by customer but not fully quantified':
      'Reconocido: problema de negocio reconocido por el cliente, pero no cuantificado por completo',
    'Quantified — Pain quantified with business impact; consequence of inaction documented':
      'Cuantificado: problema de negocio cuantificado por su impacto empresarial; consecuencias de la inacción documentadas',
    'Urgent — Multiple stakeholders confirm pain; triggering event identified; clear deadline driver':
      'Urgente: varias partes interesadas confirman el problema de negocio; evento desencadenante identificado; existe un motivo claro que impone la fecha límite',
    'Unknown — No pain identified or discussed; solution looking for a problem':
      'Desconocido: no se identificó ni discutió ningún problema de negocio; una solución en busca de un problema',
    'Mobilizing — Champion is actively coaching you, sharing intel, and taking concrete actions weekly':
      'Movilización: el promotor interno lo asesora activamente, comparte información y toma medidas concretas cada semana',
    'Controlled — All gates mapped; no surprises expected; legal/security/procurement flow confirmed':
      'Controlado: todos los puntos de aprobación están definidos; no se esperan sorpresas; flujo legal, de seguridad y adquisiciones confirmado',
    'The procurement mechanics — quotes, approvals, vendor onboarding, security review, legal redlines, signature process':
      'Los mecanismos de adquisición: cotizaciones, aprobaciones, incorporación de proveedores, revisión de seguridad, revisiones contractuales y proceso de firma',
    'The requirements the customer will use to evaluate options — technical, business, operational, and commercial':
      'Los requisitos que el cliente utilizará para evaluar las opciones: técnicos, empresariales, operativos y comerciales',
    'Total Booked Value': 'Valor total contratado',
    'Why Anything': 'Por qué cambiar',
    '3 Whys — (Why Anything, Why Us, Why Now)':
      '3 porqués — (Por qué cambiar, por qué nosotros, por qué ahora)',
  },
  de: {
    'Account ID': 'Konto-ID',
    'Account Name': 'Kontoname',
    Owner: 'Verantwortlicher',
    'Relationship Owner': 'Beziehungsverantwortlicher',
    'Economic buyer': 'Wirtschaftlicher Entscheider',
    'The compelling business pain that creates urgency to act':
      'Das dringende Geschäftsproblem, das Handlungsbedarf schafft',
    'Identified — Pain implied but not explicitly confirmed by customer':
      'Identifiziert – Geschäftsproblem vermutet, aber nicht ausdrücklich vom Kunden bestätigt',
    'Acknowledged — Pain acknowledged by customer but not fully quantified':
      'Anerkannt – Geschäftsproblem vom Kunden anerkannt, aber nicht vollständig quantifiziert',
    'Quantified — Pain quantified with business impact; consequence of inaction documented':
      'Quantifiziert – Geschäftsproblem nach Geschäftsauswirkung quantifiziert; Folgen der Untätigkeit dokumentiert',
    'Urgent — Multiple stakeholders confirm pain; triggering event identified; clear deadline driver':
      'Dringend – Mehrere Beteiligte bestätigen das Geschäftsproblem; auslösendes Ereignis identifiziert; klarer geschäftlicher Grund für den Zeitdruck',
    'Unknown — No pain identified or discussed; solution looking for a problem':
      'Unbekannt – Kein Geschäftsproblem identifiziert oder besprochen; eine Lösung auf der Suche nach einem Problem',
    'Mobilizing — Champion is actively coaching you, sharing intel, and taking concrete actions weekly':
      'Mobilisiert – Der interne Fürsprecher coacht Sie aktiv, teilt Informationen und ergreift wöchentlich konkrete Maßnahmen',
    'Controlled — All gates mapped; no surprises expected; legal/security/procurement flow confirmed':
      'Kontrolliert – Alle Freigabeschritte sind abgebildet; keine Überraschungen erwartet; Rechts-, Sicherheits- und Beschaffungsablauf bestätigt',
    'The procurement mechanics — quotes, approvals, vendor onboarding, security review, legal redlines, signature process':
      'Der Beschaffungsablauf – Angebote, Genehmigungen, Lieferanten-Onboarding, Sicherheitsprüfung, Vertragsänderungen und Unterschriftsprozess',
    'Total Booked Value': 'Gesamtauftragswert',
    'Why Anything': 'Warum überhaupt',
    '3 Whys — (Why Anything, Why Us, Why Now)': '3 Warum – (Warum überhaupt, Warum wir, Warum jetzt)',
    'Engaged — EB identified by name; no direct access yet but plan exists':
      'Eingebunden – EB namentlich identifiziert; noch kein direkter Zugang, aber ein Plan ist vorhanden',
  },
  'pt-br': {
    'Account ID': 'ID da conta',
    'Account Name': 'Nome da conta',
    Owner: 'Responsável',
    'Relationship Owner': 'Responsável pelo relacionamento',
    'Economic buyer': 'Comprador Econômico',
    'The compelling business pain that creates urgency to act':
      'O problema de negócio crítico que cria urgência para agir',
    'Identified — Pain implied but not explicitly confirmed by customer':
      'Identificado — Problema de negócio implícito, mas não confirmado explicitamente pelo cliente',
    'Acknowledged — Pain acknowledged by customer but not fully quantified':
      'Reconhecido — Problema de negócio reconhecido pelo cliente, mas não totalmente quantificado',
    'Quantified — Pain quantified with business impact; consequence of inaction documented':
      'Quantificado — Problema de negócio quantificado pelo impacto empresarial; consequências da inação documentadas',
    'Urgent — Multiple stakeholders confirm pain; triggering event identified; clear deadline driver':
      'Urgente — Várias partes interessadas confirmam o problema de negócio; evento desencadeador identificado; motivo claro que impõe o prazo',
    'Unknown — No pain identified or discussed; solution looking for a problem':
      'Desconhecido — Nenhum problema de negócio identificado ou discutido; uma solução à procura de um problema',
    'Mobilizing — Champion is actively coaching you, sharing intel, and taking concrete actions weekly':
      'Mobilização — O patrocinador interno orienta você ativamente, compartilha informações e toma ações concretas toda semana',
    'Controlled — All gates mapped; no surprises expected; legal/security/procurement flow confirmed':
      'Controlado — Todos os pontos de aprovação estão mapeados; nenhuma surpresa esperada; fluxo jurídico, de segurança e de compras confirmado',
    'The procurement mechanics — quotes, approvals, vendor onboarding, security review, legal redlines, signature process':
      'O processo de compras — cotações, aprovações, integração de fornecedores, revisão de segurança, revisões contratuais e processo de assinatura',
    'The requirements the customer will use to evaluate options — technical, business, operational, and commercial':
      'Os requisitos que o cliente usará para avaliar as opções — técnicos, de negócio, operacionais e comerciais',
    'Total Booked Value': 'Valor total contratado',
    'Why Anything': 'Por que mudar',
    '3 Whys — (Why Anything, Why Us, Why Now)': '3 porquês — (por que mudar, por que nós, por que agora)',
  },
  ko: {
    'Account ID': '계정 ID',
    'Account Name': '계정 이름',
    Owner: '담당자',
    'Relationship Owner': '관계 담당자',
    'Economic buyer': '경제적 의사결정권자',
    'Close Date': '예상 영업 마감일',
    'The compelling business pain that creates urgency to act':
      '긴급한 조치를 취하도록 만드는 중대한 비즈니스 문제',
    'Identified — Pain implied but not explicitly confirmed by customer':
      '식별됨 — 비즈니스 문제가 암시되었으나 고객이 명확히 확인하지 않음',
    'Acknowledged — Pain acknowledged by customer but not fully quantified':
      '확인됨 — 고객이 비즈니스 문제를 인정했으나 완전히 정량화되지 않음',
    'Quantified — Pain quantified with business impact; consequence of inaction documented':
      '정량화됨 — 비즈니스 문제의 사업 영향을 정량화하고 미조치 결과를 문서화함',
    'Urgent — Multiple stakeholders confirm pain; triggering event identified; clear deadline driver':
      '긴급 — 여러 이해관계자가 비즈니스 문제를 확인함; 촉발 사건이 식별됨; 기한을 정하는 명확한 사업 요인이 있음',
    'Unknown — No pain identified or discussed; solution looking for a problem':
      '알 수 없음 — 비즈니스 문제가 식별되거나 논의되지 않음; 문제를 찾는 솔루션',
    'Mobilizing — Champion is actively coaching you, sharing intel, and taking concrete actions weekly':
      '활성화됨 — 내부 지지자가 적극적으로 조언하고, 정보를 공유하며, 매주 구체적인 조치를 취함',
    'Controlled — All gates mapped; no surprises expected; legal/security/procurement flow confirmed':
      '통제됨 — 모든 승인 단계가 파악됨; 예상치 못한 문제 없음; 법무/보안/조달 절차 확인',
    'The procurement mechanics — quotes, approvals, vendor onboarding, security review, legal redlines, signature process':
      '조달 절차 — 견적, 승인, 공급업체 등록, 보안 검토, 계약서 법무 수정 및 서명 절차',
    'Total Booked Value': '총 계약 금액',
    'Why Anything': '왜 변화해야 하는가',
    '3 Whys — (Why Anything, Why Us, Why Now)':
      '3가지 이유 — (왜 변화해야 하는가, 왜 우리인가, 왜 지금인가)',
    'Aligned — Direct access achieved; EB priorities and personal win documented':
      '조율됨 — 직접 접촉 성사; EB 우선순위 및 개인적 성공 요인 문서화',
    'Committed — Client has committed to metrics in writing or proposal':
      '확약됨 — 고객이 서면 또는 제안서에서 지표에 동의함',
  },
  'zh-cn': {
    'Account ID': '客户ID',
    'Account Name': '客户名称',
    Owner: '负责人',
    'Relationship Owner': '关系负责人',
    'Economic buyer': '经济决策者',
    'Close Date': '预计成交日期',
    'The compelling business pain that creates urgency to act': '促使立即行动的关键业务痛点',
    'Identified — Pain implied but not explicitly confirmed by customer':
      '已识别——已发现潜在业务痛点，但客户尚未明确确认',
    'Acknowledged — Pain acknowledged by customer but not fully quantified':
      '已确认——客户已确认业务痛点，但尚未完全量化',
    'Quantified — Pain quantified with business impact; consequence of inaction documented':
      '已量化——已量化业务痛点的商业影响；已记录不采取行动的后果',
    'Urgent — Multiple stakeholders confirm pain; triggering event identified; clear deadline driver':
      '紧急——多位利益相关者已确认业务痛点；已识别触发事件；有明确的业务因素决定截止日期',
    'Unknown — No pain identified or discussed; solution looking for a problem':
      '未知——尚未识别或讨论业务痛点；解决方案在寻找问题',
    'Mobilizing — Champion is actively coaching you, sharing intel, and taking concrete actions weekly':
      '动员中——内部支持者每周积极指导您、分享信息并采取具体行动',
    'Controlled — All gates mapped; no surprises expected; legal/security/procurement flow confirmed':
      '受控——所有审批节点均已梳理；预计无意外；法务、安全和采购流程已确认',
    'The procurement mechanics — quotes, approvals, vendor onboarding, security review, legal redlines, signature process':
      '采购流程——报价、审批、供应商准入、安全审查、合同条款修订和签署流程',
    'Total Booked Value': '合同总金额',
    'Why Anything': '为什么要改变',
    '3 Whys — (Why Anything, Why Us, Why Now)':
      '三个为什么——（为什么要改变、为什么选择我们、为什么是现在）',
    'Neutralized — Competitive proof delivered; do-nothing risk assessed; win theme validated with customer':
      '已化解——已提供竞争优势证明；已评估不作为的风险；制胜主题已获客户确认',
  },
  'zh-tw': {
    'Account ID': '客戶ID',
    'Account Name': '客戶名稱',
    Owner: '負責人',
    'Relationship Owner': '關係負責人',
    'Economic buyer': '經濟決策者',
    'Close Date': '預計成交日期',
    'The compelling business pain that creates urgency to act': '促使立即行動的關鍵業務痛點',
    'Identified — Pain implied but not explicitly confirmed by customer':
      '已識別——已發現潛在業務痛點，但客戶尚未明確確認',
    'Acknowledged — Pain acknowledged by customer but not fully quantified':
      '已確認——客戶已確認業務痛點，但尚未完全量化',
    'Quantified — Pain quantified with business impact; consequence of inaction documented':
      '已量化——已量化業務痛點的商業影響；已記錄不採取行動的後果',
    'Urgent — Multiple stakeholders confirm pain; triggering event identified; clear deadline driver':
      '緊急——多位利害關係人已確認業務痛點；已識別觸發事件；有明確的業務因素決定截止日期',
    'Unknown — No pain identified or discussed; solution looking for a problem':
      '未知——尚未識別或討論業務痛點；解決方案在尋找問題',
    'Mobilizing — Champion is actively coaching you, sharing intel, and taking concrete actions weekly':
      '推動中——內部支持者每週積極指導您、分享資訊並採取具體行動',
    'Controlled — All gates mapped; no surprises expected; legal/security/procurement flow confirmed':
      '受控——所有核准節點均已梳理；預計無意外；法務、安全和採購流程已確認',
    'The procurement mechanics — quotes, approvals, vendor onboarding, security review, legal redlines, signature process':
      '採購流程——報價、核准、供應商准入、安全審查、合約條款修訂和簽署流程',
    'Total Booked Value': '合約總金額',
    'Why Anything': '為什麼要改變',
    '3 Whys — (Why Anything, Why Us, Why Now)':
      '三個為什麼——（為什麼要改變、為什麼選擇我們、為什麼是現在）',
    'Neutralized — Competitive proof delivered; do-nothing risk assessed; win theme validated with customer':
      '已化解——已提供競爭優勢證明；已評估不採取行動的風險；致勝主題已獲客戶確認',
  },
  it: {
    'Account ID': 'ID conto',
    'Account Name': "Nome dell'account",
    Owner: 'Responsabile',
    'Relationship Owner': 'Responsabile della relazione',
    'Economic buyer': 'Decisore economico',
    'The compelling business pain that creates urgency to act':
      'Il problema aziendale critico che crea urgenza di agire',
    'Identified — Pain implied but not explicitly confirmed by customer':
      'Identificato: problema aziendale implicito, ma non confermato esplicitamente dal cliente',
    'Acknowledged — Pain acknowledged by customer but not fully quantified':
      'Riconosciuto: problema aziendale riconosciuto dal cliente, ma non completamente quantificato',
    'Quantified — Pain quantified with business impact; consequence of inaction documented':
      "Quantificato: problema aziendale quantificato in base all'impatto commerciale; conseguenze dell'inazione documentate",
    'Urgent — Multiple stakeholders confirm pain; triggering event identified; clear deadline driver':
      'Urgente: più parti interessate confermano il problema aziendale; evento scatenante identificato; chiara ragione aziendale che impone la scadenza',
    'Unknown — No pain identified or discussed; solution looking for a problem':
      'Sconosciuto: nessun problema aziendale identificato o discusso; una soluzione in cerca di un problema',
    'Mobilizing — Champion is actively coaching you, sharing intel, and taking concrete actions weekly':
      'Mobilitazione: il sostenitore interno ti consiglia attivamente, condivide informazioni e intraprende azioni concrete ogni settimana',
    'Controlled — All gates mapped; no surprises expected; legal/security/procurement flow confirmed':
      'Controllato: tutti i punti di approvazione sono mappati; nessuna sorpresa prevista; flusso legale, di sicurezza e approvvigionamento confermato',
    'The procurement mechanics — quotes, approvals, vendor onboarding, security review, legal redlines, signature process':
      'Il processo di approvvigionamento: preventivi, approvazioni, onboarding dei fornitori, revisione della sicurezza, revisioni contrattuali e processo di firma',
    'Total Booked Value': 'Valore totale contrattualizzato',
    'Why Anything': 'Perché cambiare',
    '3 Whys — (Why Anything, Why Us, Why Now)': '3 perché – (Perché cambiare, perché noi, perché adesso)',
  },
  hi: {
    'Account ID': 'खाता आईडी',
    'Account Name': 'खाता नाम',
    Owner: 'ज़िम्मेदार व्यक्ति',
    'Relationship Owner': 'संबंध प्रबंधक',
    'Economic buyer': 'आर्थिक निर्णयकर्ता',
    'The compelling business pain that creates urgency to act':
      'तत्काल कार्रवाई की आवश्यकता पैदा करने वाली गंभीर व्यावसायिक समस्या',
    'Identified — Pain implied but not explicitly confirmed by customer':
      'पहचान की गई — व्यावसायिक समस्या के संकेत मिले हैं, लेकिन ग्राहक ने स्पष्ट रूप से पुष्टि नहीं की',
    'Acknowledged — Pain acknowledged by customer but not fully quantified':
      'स्वीकृत — ग्राहक ने व्यावसायिक समस्या स्वीकार की, लेकिन उसे पूरी तरह मापा नहीं गया',
    'Quantified — Pain quantified with business impact; consequence of inaction documented':
      'परिमाणित — व्यावसायिक समस्या के प्रभाव को मापा गया; कार्रवाई न करने के परिणाम दर्ज किए गए',
    'Urgent — Multiple stakeholders confirm pain; triggering event identified; clear deadline driver':
      'अत्यावश्यक — कई हितधारकों ने व्यावसायिक समस्या की पुष्टि की; प्रेरक घटना पहचानी गई; समय-सीमा तय करने वाला स्पष्ट व्यावसायिक कारण मौजूद है',
    'Unknown — No pain identified or discussed; solution looking for a problem':
      'अज्ञात — किसी व्यावसायिक समस्या की पहचान या चर्चा नहीं हुई; समस्या की तलाश में समाधान',
    'Mobilizing — Champion is actively coaching you, sharing intel, and taking concrete actions weekly':
      'सक्रिय — आंतरिक समर्थक आपको मार्गदर्शन देता है, जानकारी साझा करता है और हर सप्ताह ठोस कदम उठाता है',
    'Controlled — All gates mapped; no surprises expected; legal/security/procurement flow confirmed':
      'नियंत्रित — सभी अनुमोदन चरण दर्ज हैं; कोई अप्रत्याशित बाधा अपेक्षित नहीं; कानूनी, सुरक्षा और खरीद प्रक्रिया की पुष्टि हो चुकी है',
    'The procurement mechanics — quotes, approvals, vendor onboarding, security review, legal redlines, signature process':
      'खरीद प्रक्रिया — कोटेशन, अनुमोदन, विक्रेता पंजीकरण, सुरक्षा समीक्षा, अनुबंध संशोधन और हस्ताक्षर प्रक्रिया',
    'Total Booked Value': 'कुल अनुबंधित मूल्य',
    'Why Anything': 'क्यों बदलें',
    '3 Whys — (Why Anything, Why Us, Why Now)': '3 क्यों — (क्यों बदलें, हम क्यों, अभी क्यों)',
  },
  th: {
    'Account ID': 'รหัสบัญชี',
    'Account Name': 'ชื่อบัญชี',
    Owner: 'ผู้รับผิดชอบ',
    'Relationship Owner': 'ผู้รับผิดชอบความสัมพันธ์',
    'Economic buyer': 'ผู้มีอำนาจตัดสินใจด้านงบประมาณ',
    'The compelling business pain that creates urgency to act':
      'ปัญหาทางธุรกิจสำคัญที่สร้างความเร่งด่วนให้ต้องดำเนินการ',
    'Identified — Pain implied but not explicitly confirmed by customer':
      'ระบุแล้ว — พบสัญญาณของปัญหาทางธุรกิจ แต่ลูกค้ายังไม่ได้ยืนยันอย่างชัดเจน',
    'Acknowledged — Pain acknowledged by customer but not fully quantified':
      'รับทราบแล้ว — ลูกค้ายอมรับปัญหาทางธุรกิจ แต่ยังไม่ได้วัดผลกระทบทั้งหมด',
    'Quantified — Pain quantified with business impact; consequence of inaction documented':
      'วัดปริมาณแล้ว — วัดผลกระทบของปัญหาต่อธุรกิจเป็นตัวเลข และบันทึกผลของการไม่ดำเนินการแล้ว',
    'Urgent — Multiple stakeholders confirm pain; triggering event identified; clear deadline driver':
      'เร่งด่วน — ผู้มีส่วนได้ส่วนเสียหลายรายยืนยันปัญหาทางธุรกิจ ระบุเหตุการณ์กระตุ้นแล้ว และมีเหตุผลทางธุรกิจที่กำหนดเส้นตายอย่างชัดเจน',
    'Unknown — No pain identified or discussed; solution looking for a problem':
      'ไม่ทราบ — ยังไม่ได้ระบุหรือหารือปัญหาทางธุรกิจ; เป็นโซลูชันที่กำลังมองหาปัญหา',
    'Why Anything': 'ทำไมต้องเปลี่ยนแปลง',
    '3 Whys — (Why Anything, Why Us, Why Now)':
      '3 เหตุผลสำคัญ — (ทำไมต้องเปลี่ยนแปลง ทำไมต้องเป็นเรา ทำไมตอนนี้)',
    'Mobilizing — Champion is actively coaching you, sharing intel, and taking concrete actions weekly':
      'กำลังขับเคลื่อน — ผู้สนับสนุนภายในกำลังให้คำแนะนำ แบ่งปันข้อมูลเชิงลึก และลงมือดำเนินการอย่างเป็นรูปธรรมทุกสัปดาห์',
    'Controlled — All gates mapped; no surprises expected; legal/security/procurement flow confirmed':
      'ควบคุมแล้ว — ระบุจุดอนุมัติทั้งหมดแล้ว; ไม่คาดว่าจะมีปัญหาไม่คาดคิด; ยืนยันขั้นตอนกฎหมาย ความปลอดภัย และการจัดซื้อแล้ว',
    'The procurement mechanics — quotes, approvals, vendor onboarding, security review, legal redlines, signature process':
      'กระบวนการจัดซื้อ — ใบเสนอราคา การอนุมัติ การขึ้นทะเบียนผู้ขาย การตรวจสอบความปลอดภัย การแก้ไขสัญญา และขั้นตอนการลงนาม',
    'Total Booked Value': 'มูลค่าสัญญารวม',
  },
} as const satisfies Record<(typeof remainingLocaleSlugs)[number], Readonly<Record<string, string>>>;
const advisoryCorrectionsByLocale = {
  fr: {
    'Aligned — Direct access achieved; EB priorities and personal win documented':
      'Aligné — Accès direct obtenu ; priorités du décideur économique et bénéfice personnel documentés',
    'Validated — Named individual with influence and credibility; personal win documented':
      "Validé – Personne désignée ayant de l'influence et de la crédibilité ; bénéfice personnel documenté",
  },
  es: {
    Deal: 'Oportunidad',
    'Deal ID': 'ID de la oportunidad',
    'Deal Status': 'Estado de la oportunidad',
    'Deal/Project Name': 'Nombre de la oportunidad/proyecto',
    'MEDDPICC Deal Review': 'Revisión MEDDPICC – oportunidad',
    'Opportunity ID': 'ID de la oportunidad',
    'Role In Deal': 'Función en la oportunidad',
    'Sponsoring — EB is actively sponsoring the deal through procurement':
      'Patrocinio: el comprador económico impulsa activamente la oportunidad durante el proceso de compras',
    'What Do They Need To Believe To Say Yes To The Deal?':
      '¿Qué deben creer para aprobar la oportunidad?',
    'Aligned — Direct access achieved; EB priorities and personal win documented':
      'Alineado: acceso directo logrado; prioridades del comprador económico y beneficio personal documentados',
    'Validated — Named individual with influence and credibility; personal win documented':
      'Validado: persona identificada con influencia y credibilidad; beneficio personal documentado',
  },
  de: {
    'Actions Open': 'Offene Maßnahmen',
    'A powerful internal advocate who sells for you when you\'re not in the room':
      'Ein starker interner Fürsprecher, der sich für Sie einsetzt, wenn Sie nicht im Raum sind',
    'Unknown — No internal advocate identified': 'Unbekannt – Kein interner Fürsprecher identifiziert',
    'Aligned — Direct access achieved; EB priorities and personal win documented':
      'Abgestimmt – Direkter Zugang erreicht; Prioritäten des wirtschaftlichen Entscheiders und persönlicher Nutzen dokumentiert',
    'Validated — Named individual with influence and credibility; personal win documented':
      'Validiert – Benannte Person mit Einfluss und Glaubwürdigkeit; persönlicher Nutzen dokumentiert',
  },
  'pt-br': {
    'Aligned — Direct access achieved; EB priorities and personal win documented':
      'Alinhado — Acesso direto alcançado; prioridades do Comprador Econômico e benefício pessoal documentados',
    'Validated — Named individual with influence and credibility; personal win documented':
      'Validado — Pessoa identificada com influência e credibilidade; benefício pessoal documentado',
  },
  ko: {
    'Actions Open': '미완료 조치',
    'Aligned — Direct access achieved; EB priorities and personal win documented':
      '조율됨 — 직접 접촉 성사; EB 우선순위 및 개인적 성공 요인 문서화',
    'Validated — Named individual with influence and credibility; personal win documented':
      '검증됨 — 영향력과 신뢰성이 있는 인물을 식별하고 개인적 성공 요인을 문서화함',
  },
  'zh-cn': {
    'In Progress — Procurement steps documented with owners; security artifacts submitted; legal in review':
      '进行中——采购步骤已记录并明确负责人；安全文档已提交；法务审核中',
    'Aligned — Direct access achieved; EB priorities and personal win documented':
      '已对齐——已实现直接接触；已记录经济决策者的优先事项和个人收益',
    'Validated — Named individual with influence and credibility; personal win documented':
      '已验证——已确定具有影响力和信誉的人选；已记录个人收益',
  },
  'zh-tw': {
    'In Progress — Procurement steps documented with owners; security artifacts submitted; legal in review':
      '進行中——採購步驟已記錄並明確負責人；安全文件已提交；法務審查中',
    'Aligned — Direct access achieved; EB priorities and personal win documented':
      '已對齊——已建立直接聯繫；已記錄經濟決策者的優先事項和個人收益',
    'Validated — Named individual with influence and credibility; personal win documented':
      '已驗證——已確認具影響力和可信度的人選；已記錄個人收益',
  },
  it: {
    'Aligned — Direct access achieved; EB priorities and personal win documented':
      'Allineato: accesso diretto ottenuto; priorità del decisore economico e beneficio personale documentati',
    'Validated — Named individual with influence and credibility; personal win documented':
      'Convalidato: persona identificata con influenza e credibilità; beneficio personale documentato',
  },
  hi: {
    'A powerful internal advocate who sells for you when you\'re not in the room':
      'एक प्रभावशाली आंतरिक समर्थक, जो आपकी अनुपस्थिति में आपकी ओर से पैरवी करता है',
    'Unknown — No internal advocate identified': 'अज्ञात — किसी आंतरिक समर्थक की पहचान नहीं हुई',
    'Aligned — Direct access achieved; EB priorities and personal win documented':
      'संरेखित — सीधी पहुँच स्थापित; आर्थिक निर्णयकर्ता की प्राथमिकताएँ और व्यक्तिगत लाभ दर्ज',
    'Validated — Named individual with influence and credibility; personal win documented':
      'मान्य — प्रभावशाली और विश्वसनीय व्यक्ति की पहचान; व्यक्तिगत लाभ दर्ज',
  },
  th: {
    Subscription: 'รายได้จากการสมัครสมาชิก',
    'Aligned — Direct access achieved; EB priorities and personal win documented':
      'สอดคล้องแล้ว — เข้าถึงโดยตรงได้แล้ว; บันทึกลำดับความสำคัญของผู้มีอำนาจตัดสินใจด้านงบประมาณและประโยชน์ส่วนบุคคลแล้ว',
    'Validated — Named individual with influence and credibility; personal win documented':
      'ตรวจสอบแล้ว — ระบุบุคคลที่มีอิทธิพลและความน่าเชื่อถือ; บันทึกประโยชน์ส่วนบุคคลแล้ว',
  },
} as const satisfies Record<(typeof remainingLocaleSlugs)[number], Readonly<Record<string, string>>>;
const rawJapanese = () =>
  JSON.parse(fs.readFileSync(path.join(here, 'locales', 'ja.json'), 'utf8')) as {
    locale: string;
    sourceHash: string;
    translations: Record<string, string>;
    sizing?: { columnWidths?: Record<string, number>; rowHeightScale?: number };
  };
const contextFrom = (raw: unknown) => localeContextFromCatalogue({ slug: 'ja', from: 'flag' }, raw, spec, schema);

const allCells = (context: LocaleContext) =>
  planWorkbook(schema, spec, deal, context).sheets.flatMap((sheet) =>
    sheet.rows.flatMap((row) => row.cells.map((cell) => ({ sheet: sheet.name, ...cell }))),
  );

describe('the Japanese catalogue', () => {
  test('is shipped, exhaustive, fresh, and explicit about the seven English terms', () => {
    expect(SHIPPED_LOCALES).toEqual(['en', 'fr', 'es', 'de', 'pt-br', 'ja', 'ko', 'zh-cn', 'zh-tw', 'it', 'hi', 'th']);
    const context = japanese();
    const sources = translatableSet(spec, schema);
    expect(Object.keys(context.translations)).toHaveLength(199);
    expect(context.sourceHash).toBe(localeSourceHash(sources));
    expect(new Set(Object.keys(context.translations))).toEqual(sources);

    for (const word of identityTerms) {
      expect(context.translations[word], word).toBe(word);
    }
    expect(Object.entries(context.translations).filter(([source, translated]) => source !== translated)).toHaveLength(
      192,
    );
  });

  test('translates workbook-owned words and never falls back silently', () => {
    const context = japanese();
    expect(localize(context, 'MEDDPICC Deal Review')).toBe('MEDDPICC案件レビュー');
    expect(localize(context, 'Not started')).toBe('未着手');
    expect(() => localize(context, 'a custom spec string')).toThrow(/missing.*translation/i);
    expect(localize(ENGLISH_LOCALE, 'a custom spec string')).toBe('a custom spec string');
  });

  test('refuses a stale stamp independently from completeness', () => {
    const stale = rawJapanese();
    stale.sourceHash = '0'.repeat(64);
    expect(() => contextFrom(stale)).toThrow(/stale.*sourceHash/i);
  });

  test('refuses a missing source even when the remaining keys carry a valid stamp', () => {
    const incomplete = rawJapanese();
    delete incomplete.translations['Account Name'];
    incomplete.sourceHash = localeSourceHash(Object.keys(incomplete.translations));
    expect(() => contextFrom(incomplete)).toThrow(/Account Name/);
  });

  test('refuses sizing outside the documented bounds', () => {
    const tooNarrow = rawJapanese();
    if (!tooNarrow.sizing?.columnWidths) throw new Error('the Japanese fixture has no width override');
    tooNarrow.sizing.columnWidths.B = 2.99;
    expect(() => contextFrom(tooNarrow)).toThrow(/between 3 and 80/);

    const tooWide = rawJapanese();
    if (!tooWide.sizing?.columnWidths) throw new Error('the Japanese fixture has no width override');
    tooWide.sizing.columnWidths.B = 80.01;
    expect(() => contextFrom(tooWide)).toThrow(/between 3 and 80/);

    const tooShort = rawJapanese();
    if (!tooShort.sizing) throw new Error('the Japanese fixture has no sizing block');
    tooShort.sizing.rowHeightScale = 0.99;
    expect(() => contextFrom(tooShort)).toThrow(/between 1.0 and 2.0/);

    const tooTall = rawJapanese();
    if (!tooTall.sizing) throw new Error('the Japanese fixture has no sizing block');
    tooTall.sizing.rowHeightScale = 2.01;
    expect(() => contextFrom(tooTall)).toThrow(/between 1.0 and 2.0/);
  });

  test('validates the sheet name after translation, not only the English source', () => {
    for (const title of ['x'.repeat(32), 'Bad/Sheet']) {
      const raw = rawJapanese();
      raw.translations['MEDDPICC Deal Review'] = title;
      const context = contextFrom(raw);
      expect(() => planWorkbook(schema, spec, deal, context)).toThrow(/sheet name/i);
    }
  });
});

describe('the remaining left-to-right catalogues', () => {
  const sources = translatableSet(spec, schema);
  const statuses = ['not_started', 'partial', 'complete'] as const;

  for (const slug of remainingLocaleSlugs) {
    test(`${slug} is exhaustive, fresh, explicitly sized, and covers every agreed source`, () => {
      const context = loadLocale({ slug, from: 'flag' }, spec, schema);
      expect(Object.keys(context.translations)).toHaveLength(199);
      expect(context.sourceHash).toBe(localeSourceHash(sources));
      expect(new Set(Object.keys(context.translations))).toEqual(sources);
      expect(context.sizing).toBeDefined();

      for (const word of identityTerms) expect(context.translations[word], word).toBe(word);
      expect(localize(context, 'MEDDPICC Deal Review')).not.toBe('MEDDPICC Deal Review');
      expect(localize(context, 'Account Name')).not.toBe('Account Name');

      expect(() => enumLabels(statuses, context)).not.toThrow();
      expect(() => booleanLabels(context)).not.toThrow();
    });

    test(`${slug} uses sales meanings for ambiguous workbook terms`, () => {
      const context = loadLocale({ slug, from: 'flag' }, spec, schema);
      for (const [source, expected] of Object.entries(salesTermsByLocale[slug])) {
        expect(context.translations[source], `${slug}: ${source}`).toBe(expected);
      }
    });

    test(`${slug} uses reviewed workflow and MEDDPICC rubric terminology`, () => {
      const context = loadLocale({ slug, from: 'flag' }, spec, schema);
      for (const [source, expected] of Object.entries(reviewedTermsByLocale[slug])) {
        expect(context.translations[source], `${slug}: ${source}`).toBe(expected);
      }
    });

    test(`${slug} preserves the business meanings found by advisory review`, () => {
      const context = loadLocale({ slug, from: 'flag' }, spec, schema);
      for (const [source, expected] of Object.entries(advisoryCorrectionsByLocale[slug])) {
        expect(context.translations[source], `${slug}: ${source}`).toBe(expected);
      }
    });

    test(`${slug} drives planning, serialization, and read-back under an English process locale`, () => {
      const context = loadLocale({ slug, from: 'flag' }, spec, schema);
      const english = planWorkbook(schema, spec, deal, ENGLISH_LOCALE);
      const translated = planWorkbook(schema, spec, deal, context);
      expect(translated.sheets[0].name).toBe(localize(context, 'MEDDPICC Deal Review'));
      expect(translated.sheets[0].name).not.toBe(english.sheets[0].name);
      expect(translated.inputCells.map((cell) => cell.address)).toEqual(english.inputCells.map((cell) => cell.address));
      expect(
        translated.sheets[0].columns?.some(
          (column) => column.min === 2 && column.max === 2 && column.width === context.sizing?.columnWidths?.B,
        ),
      ).toBe(true);
      expect(translated.sheets[0].rows[0].height).toBeGreaterThan(english.sheets[0].rows[0].height ?? 0);
      expect(
        translated.sheets
          .flatMap((sheet) => sheet.validations ?? [])
          .some((validation) => validation.values.includes(localize(context, 'In progress'))),
      ).toBe(true);

      const bytes = generateWorkbook(schema, spec, deal, 'test', context);
      expect(readWorkbookProperty(bytes, 'MeddpiccLocale')).toBe(slug);
      const sheet = new TextDecoder().decode(readZip(bytes).get('xl/worksheets/sheet1.xml')?.data);
      expect(sheet).toContain(localize(context, 'Not started'));
      expect(sheet).toContain(localize(context, 'In progress'));

      const before = process.env.LANG;
      process.env.LANG = 'en_US.UTF-8';
      try {
        const report = readWorkbook(schema, spec, deal, bytes);
        expect(report.ok).toBe(true);
        expect(report.proposals).toEqual([]);
        expect(report.rejections).toEqual([]);
      } finally {
        if (before === undefined) delete process.env.LANG;
        else process.env.LANG = before;
      }
    });
  }

  test('the deal schema describes the shipped locale boundary accurately', () => {
    const description = schema.properties.metadata.properties.locale.description;
    expect(description).toMatch(/all listed locales except .*ar.*implemented/i);
    expect(description).not.toMatch(/only .*en.*implemented/i);
  });
});

describe('localized enum round trips', () => {
  const statuses = ['not_started', 'partial', 'complete'] as const;

  test('accepts canonical, English, and Japanese forms within the enum being read', () => {
    const context = japanese();
    expect(enumLabels(statuses, context)).toEqual(['未着手', '一部完了', '完了']);
    expect(canonicalEnumValue('not_started', statuses, context)).toBe('not_started');
    expect(canonicalEnumValue('Not started', statuses, context)).toBe('not_started');
    expect(canonicalEnumValue('未着手', statuses, context)).toBe('not_started');
  });

  test('refuses a translated collision per enum, while another enum may reuse the same word', () => {
    const collision: LocaleContext = {
      ...ENGLISH_LOCALE,
      slug: 'xx',
      translations: { 'Not started': '同じ', Partial: '同じ', Complete: '完了', Pending: '同じ' },
    };
    expect(() => enumLabels(statuses, collision)).toThrow(/not_started.*partial|partial.*not_started/i);
    expect(enumLabels(['pending', 'complete'], collision)).toEqual(['同じ', '完了']);
  });
});

describe('localized boolean round trips', () => {
  test('accepts English and Japanese forms and refuses an ambiguous translation', () => {
    const context = japanese();
    expect(canonicalBooleanValue('Yes', context)).toBe(true);
    expect(canonicalBooleanValue('はい', context)).toBe(true);
    expect(canonicalBooleanValue('No', context)).toBe(false);
    expect(canonicalBooleanValue('いいえ', context)).toBe(false);

    const collision: LocaleContext = {
      ...ENGLISH_LOCALE,
      slug: 'xx',
      translations: { Yes: '同じ', No: '同じ' },
    };
    expect(() => booleanLabels(collision)).toThrow(/Yes and No.*同じ/);
  });

  test('refuses either localized boolean when it collides with the opposite English word', () => {
    const translatedYesIsEnglishNo: LocaleContext = {
      ...ENGLISH_LOCALE,
      slug: 'xx',
      translations: { Yes: 'No', No: 'いいえ' },
    };
    expect(() => booleanLabels(translatedYesIsEnglishNo)).toThrow(/Yes and No.*No/);

    const translatedNoIsEnglishYes: LocaleContext = {
      ...ENGLISH_LOCALE,
      slug: 'xx',
      translations: { Yes: 'はい', No: 'Yes' },
    };
    expect(() => booleanLabels(translatedNoIsEnglishYes)).toThrow(/Yes and No.*Yes/);
  });
});

describe('Japanese planning and serialization', () => {
  test('one context drives tabs, labels, schema prose, dropdowns, and formulas', () => {
    const context = japanese();
    const plan = planWorkbook(schema, spec, deal, context);
    expect(plan.sheets[0].name).toBe('MEDDPICC案件レビュー');
    const cells = allCells(context);
    expect(cells.some((cell) => cell.value === 'アカウント名')).toBe(true);
    expect(cells.some((cell) => cell.value === '指標')).toBe(true);
    expect(cells.some((cell) => cell.formula?.includes('一部完了'))).toBe(true);
    expect(cells.some((cell) => cell.formula?.includes('完了'))).toBe(true);
    expect(cells.some((cell) => cell.formula?.includes('はい'))).toBe(true);
    expect(plan.sheets.flatMap((sheet) => sheet.validations ?? []).some((v) => v.values.includes('進行中'))).toBe(true);
    expect(cells.some((cell) => cell.value === 'Example Corp')).toBe(true);
  });

  test('applies bounded sizing overrides without changing the grid', () => {
    const english = planWorkbook(schema, spec, deal, ENGLISH_LOCALE);
    const translated = planWorkbook(schema, spec, deal, japanese());
    expect(
      translated.sheets[0].columns?.some((column) => column.min === 2 && column.max === 2 && column.width === 20),
    ).toBe(true);
    expect(translated.sheets[0].rows[0].height).toBeGreaterThan(english.sheets[0].rows[0].height ?? 0);
    expect(translated.inputCells.map((cell) => cell.address)).toEqual(english.inputCells.map((cell) => cell.address));
  });

  test('serializes localized conditional-format words and records Japanese', () => {
    const bytes = generateWorkbook(schema, spec, deal, 'test', japanese());
    expect(readWorkbookProperty(bytes, 'MeddpiccLocale')).toBe('ja');
    const sheet = new TextDecoder().decode(readZip(bytes).get('xl/worksheets/sheet1.xml')?.data);
    expect(sheet).toContain('&quot;未着手&quot;');
    expect(sheet).toContain('&quot;進行中&quot;');
  });

  test('reads the recorded Japanese locale under any process language', () => {
    const bytes = generateWorkbook(schema, spec, deal, 'test', japanese());
    const before = process.env.LANG;
    process.env.LANG = 'en_US.UTF-8';
    try {
      const report = readWorkbook(schema, spec, deal, bytes);
      expect(report.ok).toBe(true);
      expect(report.proposals).toEqual([]);
      expect(report.rejections).toEqual([]);
    } finally {
      if (before === undefined) delete process.env.LANG;
      else process.env.LANG = before;
    }
  });

  test('refuses a localized custom spec whose text is absent from the catalogue', () => {
    const custom = structuredClone(spec);
    custom.sheets[0].blocks.unshift({ kind: 'section', text: 'Custom qualification lens' });
    expect(() => planWorkbook(schema, custom, deal, japanese())).toThrow(/Custom qualification lens/);
  });
});
