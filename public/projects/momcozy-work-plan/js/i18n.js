(function () {
  const lang = 'zh-CN';
  document.documentElement.lang = lang;
  document.documentElement.dataset.lang = lang;
  window.__I18N_LANG = lang;

  window.getCharHTML = function (ch) {
    if (ch === ' ') return '&nbsp;';
    if (ch === '🡲' || ch === '🡺') return '<svg style="width: 1.25em; height: 1.25em; vertical-align: -0.25em;" viewBox="0 0 84 85" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M11 38H54L37 21H51L73 43L51 65H37L54 48H11Z"/></svg>';
    if (ch === '🡼') return '<svg style="width: 1.25em; height: 1.25em; vertical-align: -0.25em;" viewBox="0 0 84 85" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(-135 42 42.5)"><path d="M11 38H54L37 21H51L73 43L51 65H37L54 48H11Z"/></g></svg>';
    if (ch === '🞣') return '<svg style="width: 0.9em; height: 0.9em; vertical-align: -0.1em; transform: translateY(-0.1em);" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C12 7.5 16.5 12 22 12C16.5 12 12 16.5 12 22C12 16.5 7.5 12 2 12C7.5 12 12 7.5 12 2Z"/></svg>';
    return ch;
  };

  const T = {
    'meta.description': 'Dragonlee Workplan：聚焦业务、组织与体验的 90 天落地。',

    'index.title': 'Dragonlee',
    'index.h1': 'Dragonlee Workplan — 业务、组织与体验的 90 天落地。',
    'index.hero.tagline': '试用期设计工作规划',
    'index.about.text': '<ol class="about-list"><li><span class="about-index">1.</span><span class="about-label">部门核心价值定位理解</span></li><li><span class="about-index">2.</span><span class="about-label">现状分析与团队盘点</span></li><li><span class="about-index">3.</span><span class="about-label">试用期目标、策略及排兵布阵</span></li><li><span class="about-index">4.</span><span class="about-label">组织绩效指标设定</span></li></ol>',
    'index.about.sub': '围绕公司女性健康管理平台战略，建立统一、高质量、可持续的产品体验能力，APP 生态设计组将从用户理解、系统架构、情感化体验、AI 体验赋能、团队与组织能力建设五个方向拆解落地，推动 APP 从单一工具型产品，逐步升级为覆盖女性健康全周期、具备智能化、个性化与可信赖服务能力的平台型产品。',
    'index.cg.phrase': '每个阶段都聚焦三件事：<br>解决<span class="other-accent">业务问题</span>，沉淀<span class="other-accent">体验标准</span><br>交付可衡量结果。',
    'index.skills.subtitle': '现状问题',
    'index.skills.text': '随着业务复杂度上升，设计资源、组织、流程与体系能力尚未完全匹配业务节奏。',
    'index.skills.frontend': '问题一：<br>需求复杂度提升，但需求输入与定义阶段不稳定',
    'index.skills.animation': '问题二：<br>设计系统缺失，导致体验不统一',
    'index.skills.backend': '问题三：<br>IoT 与多端体验缺乏统一语境',
    'index.skills.database': '问题四：<br>流程和排期不稳定，设计交付缺少闭环',
    'index.skills.devops': '问题五：<br>设计资源分配与组织结构未匹配业务复杂度',
    'index.skills.security': '问题六：<br>团队能力与组织机制仍偏个人驱动，缺少体系沉淀',
    'index.skills.design': '其他：当前仍停留在线性流程，尚未进入 AI Native 设计工作模式',
    'index.contact.title': '交流',
    'index.contact.dispo1': '围绕<span class="other-accent">业务目标、组织分工、关键项目节奏</span>继续校准，让 Workplan 从判断走向共识。',
    'index.contact.dispo2': '下一步聚焦<span class="other-accent">App 3.1、agency 630、IoT 体验盘点</span>与设计基线共建，用可交付成果验证组织价值。',
    'index.proj.label': '详情',
    'index.detail.back': '🡼返回',

    'info.title': '规划说明',
    'info.eyebrow': 'Info',
    'info.role': 'Dragonlee Workplan。',
    'info.desc': '围绕女性健康管理平台战略，拆解设计组织价值、现状问题、试用期策略、团队排兵布阵和绩效指标。',
    'info.meta.based': '组织',
    'info.meta.status': '阶段',
    'info.meta.based.value': 'APP 生态设计组',
    'info.meta.status.value': '试用期规划',
    'info.skills.frontend': '业务体验',
    'info.skills.animation': '智能体验',
    'info.skills.backend': '体系建设',
    'info.skills.security': '组织交付',

    'contact.title': '敬请交流',
    'contact.panel.title': '围绕规划继续对齐。',
    'contact.panel.copy': '重点校准业务目标、组织分工、关键项目节奏和阶段性成果。',
    'contact.meta.base': '组织',
    'contact.meta.status': '状态',
    'contact.meta.delay': '周期',
    'contact.meta.base.value': 'APP 生态设计组',
    'contact.meta.status.value': '持续修订',
    'contact.meta.delay.value': '90 天',
    'contact.eyebrow': '交流',
    'contact.role': 'Dragonlee Workplan。',
    'contact.desc': '用业务交付、体验质量、体系沉淀和组织能力建设证明设计价值。',
    'contact.shortcuts': '锚点',
    'contact.brief': '讨论维度',
    'contact.maildirect': '交流入口',
    'contact.brief.product': '业务目标',
    'contact.brief.deadline': '版本节奏',
    'contact.brief.stack': '组织分工',
    'contact.brief.deliverables': '阶段成果',

    'works.title': '工作规划',
    'works.h1': 'Dragonlee Workplan：业务、组织与体验的 90 天落地。',

    'common.aria.back': '返回首页',
    'common.aria.menu': '主导航',
    'common.aria.social': '规划锚点',
    'common.aria.footer': '页脚导航',

    '404.title': '404 — 页面不存在',
    '404.subtitle': '这个页面暂未纳入当前 Workplan。<br><span class="subtitle-dim">请返回首页继续查看。</span>',
    '404.ticker': '— 页面不存在 — 返回 Workplan — Dragonlee Workplan — ',
    '404.aria.back': '返回首页',
  };

  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    const key = el.getAttribute('data-i18n');
    if (T[key] != null) el.innerHTML = T[key];
  });

  document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
    el.getAttribute('data-i18n-attr').split('|').forEach(function (pair) {
      const idx = pair.indexOf(':');
      if (idx < 0) return;
      const attr = pair.slice(0, idx).trim();
      const key = pair.slice(idx + 1).trim();
      if (T[key] != null) el.setAttribute(attr, T[key]);
    });
  });

  const titleKey = document.documentElement.getAttribute('data-i18n-title');
  if (titleKey && T[titleKey]) document.title = T[titleKey];

  const descMeta = document.querySelector('meta[name="description"]');
  if (descMeta && T['meta.description']) descMeta.setAttribute('content', T['meta.description']);

  window.__t = function (key) { return T[key]; };
})();
