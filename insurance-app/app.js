/* =========================================================================
 * app.js — 내 보험 한눈에 (PWA)
 *  - 보험 데이터·청구기록은 localStorage, 증권 사진은 IndexedDB에 저장됩니다.
 *  - 어떤 정보도 서버로 전송되지 않습니다.
 * =======================================================================*/
'use strict';

const STORE_KEY = 'myInsurance.policies.v1';
const CLAIMS_KEY = 'myInsurance.claims.v1';
const $app = document.getElementById('app');
const $title = document.getElementById('screenTitle');
const $modalRoot = document.getElementById('modalRoot');
const $fab = document.getElementById('fab');

const PROFILE_KEY = 'myInsurance.profile.v1';
let state = {
  tab: 'policies',
  policies: loadPolicies(),
  claims: loadClaims(),
  profile: loadProfile(),
  filterInsured: '전체',
  sort: 'default',
};

function loadProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch (e) { return {}; } }
function saveProfile() { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile)); } catch (e) {} }
function profileAge() {
  const by = state.profile && state.profile.birthYear;
  if (!by) return null;
  const a = new Date().getFullYear() - by;
  return (a > 0 && a < 120) ? a : null;
}
function ageBand(a) { return a < 30 ? '20대' : a < 40 ? '30대' : a < 50 ? '40대' : a < 60 ? '50대' : '60대이상'; }
/* 프로필(나이·결혼·자녀)을 반영한 권장 보장액 계산 */
function computeBenchmark(band) {
  const p = state.profile || {};
  const married = !!p.married;
  const children = Math.max(0, parseInt(p.children, 10) || 0);
  const af = AGE_FACTOR;
  const deathRaw = (BENCH_DEATH.self + (married ? BENCH_DEATH.spouse : 0) + children * BENCH_DEATH.perChild) * af.death[band];
  return {
    death: Math.min(BENCH_DEATH.cap, Math.round(deathRaw)),
    diagnosis: Math.round(BENCH_BASE.diagnosis * af.diagnosis[band]),
    disability: Math.round(BENCH_BASE.disability * af.disability[band]),
  };
}
function coverageByCategory() {
  const sum = {}, exist = new Set();
  state.policies.forEach(p => (p.coverages || []).forEach(c => {
    exist.add(c.category);
    sum[c.category] = (sum[c.category] || 0) + (Number(c.amount) || 0);
  }));
  return { sum, exist };
}

const CLAIM_STATUSES = ['준비 중', '접수함', '심사 중', '지급 완료'];

/* ---------- 저장소 ---------- */
function loadPolicies() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw === null) return structuredCloneSafe(SAMPLE_POLICIES);
    return JSON.parse(raw);
  } catch (e) { return []; }
}
function savePolicies() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.policies)); }
  catch (e) { alert('저장 공간이 부족하거나 비공개 모드일 수 있어요.'); }
}
function loadClaims() {
  try { return JSON.parse(localStorage.getItem(CLAIMS_KEY)) || []; }
  catch (e) { return []; }
}
function saveClaims() {
  try { localStorage.setItem(CLAIMS_KEY, JSON.stringify(state.claims)); } catch (e) {}
}
function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }

/* ---------- 증권 사진 저장 (IndexedDB) ---------- */
const DB_NAME = 'myInsuranceDB', PHOTO_STORE = 'photos';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(PHOTO_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function putPhoto(id, dataUrl) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).put(dataUrl, id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function getPhoto(id) {
  try {
    const db = await idb();
    return await new Promise(res => {
      const tx = db.transaction(PHOTO_STORE, 'readonly');
      const rq = tx.objectStore(PHOTO_STORE).get(id);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => res(null);
    });
  } catch (e) { return null; }
}
async function delPhoto(id) {
  try {
    const db = await idb();
    return await new Promise(res => {
      const tx = db.transaction(PHOTO_STORE, 'readwrite');
      tx.objectStore(PHOTO_STORE).delete(id);
      tx.oncomplete = res; tx.onerror = res;
    });
  } catch (e) {}
}

/* ---------- 유틸 ---------- */
function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
  ));
}
function won(n) {
  if (n === '' || n === null || n === undefined || isNaN(n)) return '';
  const v = Number(n);
  if (v >= 100000000) return (v / 100000000).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '억원';
  if (v >= 10000) return (v / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '만원';
  return v.toLocaleString('ko-KR') + '원';
}

/* ---------- 날짜 / 일정 ---------- */
function daysUntil(s) {
  if (!s) return null;
  const d = new Date(s); if (isNaN(d)) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}
function parseRenewalYears(r) { const m = /\((\d+)\s*년\)/.exec(r || ''); return m ? +m[1] : 0; }
function computeNextRenewal(startDate, years) {
  if (!startDate || !years) return '';
  const start = new Date(startDate); if (isNaN(start)) return '';
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(start);
  let guard = 0;
  while (d <= now && guard++ < 200) d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}
function policyEvents(p) {
  const evs = [];
  if (p.maturityDate) {
    const d = daysUntil(p.maturityDate);
    if (d !== null) evs.push({ policy: p, type: '만기', date: p.maturityDate, days: d });
  }
  let rdate = p.renewalDate;
  if (!rdate) { const y = parseRenewalYears(p.renewal); if (y) rdate = computeNextRenewal(p.startDate, y); }
  if (rdate) {
    const d = daysUntil(rdate);
    if (d !== null) evs.push({ policy: p, type: '갱신', date: rdate, days: d, est: !p.renewalDate });
  }
  return evs;
}
function upcomingEvents(minDays = -30, maxDays = 120, pool = state.policies) {
  const all = [];
  pool.forEach(p => policyEvents(p).forEach(e => all.push(e)));
  return all.filter(e => e.days >= minDays && e.days <= maxDays).sort((a, b) => a.days - b.days);
}
function dueClass(days) { return days < 0 ? 'due-over' : days <= 7 ? 'due-red' : days <= 30 ? 'due-orange' : 'due-soft'; }
function dueLabel(days) { return days < 0 ? `${-days}일 지남` : days === 0 ? '오늘' : `D-${days}`; }

/* ---------- 라우팅(탭) ---------- */
const TAB_TITLES = {
  policies: '내 보험 한눈에',
  coverage: '보장 한눈에 보기',
  situations: '상황별 보장 찾기',
  glossary: '쉬운 용어 사전',
};
function setTab(tab) {
  state.tab = tab;
  $title.textContent = TAB_TITLES[tab];
  document.querySelectorAll('.tab').forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $fab.style.display = (tab === 'policies') ? 'flex' : 'none';
  render();
}
function render() {
  if (state.tab === 'policies') return renderPolicies();
  if (state.tab === 'coverage') return renderCoverage();
  if (state.tab === 'situations') return renderSituations();
  if (state.tab === 'glossary') return renderGlossary();
}
function emptyState(text, hint) {
  return `<div class="empty">
    <div class="empty-ico">📭</div>
    <p class="empty-title">${esc(text)}</p>
    ${hint ? `<p class="empty-hint">${esc(hint)}</p>` : ''}
  </div>`;
}

/* ---------- 가족(피보험자) / 정렬 ---------- */
function insuredList() {
  const set = [];
  state.policies.forEach(p => { const v = (p.insured || '').trim(); if (v && !set.includes(v)) set.push(v); });
  return set;
}
function applyFilterSort(list) {
  let out = state.filterInsured === '전체'
    ? list.slice()
    : list.filter(p => (p.insured || '').trim() === state.filterInsured);
  const monthly = p => p.premiumCycle === '연' ? (Number(p.premium) || 0) / 12 : (Number(p.premium) || 0);
  const nextDue = p => { const e = policyEvents(p).filter(x => x.days >= 0).sort((a, b) => a.days - b.days)[0]; return e ? e.days : Infinity; };
  if (state.sort === 'premium') out.sort((a, b) => monthly(b) - monthly(a));
  else if (state.sort === 'due') out.sort((a, b) => nextDue(a) - nextDue(b));
  else if (state.sort === 'insurer') out.sort((a, b) => (a.insurer || '').localeCompare(b.insurer || '', 'ko'));
  else if (state.sort === 'start') out.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  return out;
}

/* === 1) 내 보험 목록 === */
function renderPolicies() {
  const all = state.policies;
  if (!all.length) {
    $app.innerHTML = `${claimsSectionHtml()}` + emptyState('아직 등록된 보험이 없어요',
      '오른쪽 아래 ＋ 버튼으로 추가하거나, 위 ⋯ 메뉴의 "보험 목록 한번에 가져오기"를 써보세요.');
    bindClaimsSection();
    return;
  }
  const list = applyFilterSort(all);
  const totalMonthly = list.reduce((s, p) => {
    const m = p.premiumCycle === '연' ? (Number(p.premium) || 0) / 12 : (Number(p.premium) || 0);
    return s + m;
  }, 0);

  // 가족 필터 칩
  const members = insuredList();
  const filterChips = members.length > 1 ? `
    <div class="filter-bar">
      ${['전체', ...members].map(m =>
        `<button class="fchip ${state.filterInsured === m ? 'on' : ''}" data-insured="${esc(m)}">${esc(m)}</button>`).join('')}
    </div>` : '';

  const sortBar = `
    <div class="sort-bar">
      <label>정렬
        <select id="sortSel">
          <option value="default" ${state.sort==='default'?'selected':''}>기본</option>
          <option value="due" ${state.sort==='due'?'selected':''}>갱신·만기 임박순</option>
          <option value="premium" ${state.sort==='premium'?'selected':''}>보험료 높은순</option>
          <option value="insurer" ${state.sort==='insurer'?'selected':''}>회사명순</option>
          <option value="start" ${state.sort==='start'?'selected':''}>최근 가입순</option>
        </select>
      </label>
    </div>`;

  const up = upcomingEvents(-30, 120, list);
  const alertHtml = up.length ? `
    <section class="alert-box">
      <div class="alert-head">⏰ 다가오는 일정 <span>${up.length}건</span></div>
      ${up.map(e => `
        <div class="alert-row ${dueClass(e.days)}">
          <span class="alert-due">${dueLabel(e.days)}</span>
          <span class="alert-text"><b>${esc(e.type)}</b> · ${esc(e.policy.insurer)} ${esc(e.policy.product)}
            <span class="alert-date">${esc(e.date)}${e.est ? ' (예상)' : ''}</span></span>
        </div>`).join('')}
    </section>` : '';

  const cards = list.map(p => {
    const covCount = (p.coverages || []).length;
    const tags = (p.coverages || []).slice(0, 4).map(c =>
      `<span class="chip">${CATEGORY_ICON[c.category] || '•'} ${esc(c.name)}</span>`).join('');
    const more = covCount > 4 ? `<span class="chip chip-more">+${covCount - 4}</span>` : '';
    const ev = policyEvents(p).filter(e => e.days >= -30 && e.days <= 120).sort((a, b) => a.days - b.days)[0];
    const dueChip = ev ? `<span class="chip due-chip ${dueClass(ev.days)}">⏰ ${esc(ev.type)} ${dueLabel(ev.days)}</span>` : '';
    return `<article class="card ${p._sample ? 'card-sample' : ''}" data-id="${p.id}">
      <div class="card-top">
        <div>
          <div class="card-insurer">${esc(p.insurer || '회사 미입력')} ${p.hasPhoto ? '<span title="증권 사진 있음">📎</span>' : ''}</div>
          <div class="card-product">${esc(p.product || '상품명 미입력')}</div>
        </div>
        <span class="badge">${esc(p.type || '기타')}</span>
      </div>
      <div class="card-meta">
        ${p.insured ? `<span>👤 ${esc(p.insured)}</span>` : ''}
        ${p.renewal ? `<span>🔁 ${esc(p.renewal)}</span>` : ''}
        ${p.premium ? `<span>💳 ${won(p.premium)}/${esc(p.premiumCycle || '월')}</span>` : ''}
        ${p.startDate ? `<span>📅 ${esc(p.startDate)} 개시</span>` : ''}
      </div>
      <div class="chips">${dueChip}${tags || '<span class="chip chip-empty">보장 미입력</span>'}${more}</div>
      <div class="card-actions">
        <button class="btn-ghost" data-act="view" data-id="${p.id}">보장 상세</button>
        <button class="btn-ghost" data-act="edit" data-id="${p.id}">✏️ 수정</button>
        <button class="btn-ghost danger" data-act="del" data-id="${p.id}">🗑️</button>
      </div>
    </article>`;
  }).join('');

  $app.innerHTML = `
    ${claimsSectionHtml()}
    <div class="summary">
      <div><strong>${list.length}</strong><span>${state.filterInsured === '전체' ? '가입 보험' : esc(state.filterInsured) + ' 보험'}</span></div>
      <button class="summary-btn" id="premiumBtn"><strong>${won(Math.round(totalMonthly))}</strong><span>월 보험료 합계 · 자세히 ›</span></button>
    </div>
    ${filterChips}
    ${sortBar}
    ${alertHtml}
    <div class="cards">${cards}</div>
    <p class="disclaimer">※ 실제 보장 여부·금액은 가입한 보험의 약관/증권 및 보험사 안내가 기준입니다. 이 앱은 개인 정리용입니다.</p>
  `;

  bindClaimsSection();
  $app.querySelector('#premiumBtn')?.addEventListener('click', openPremiumDashboard);
  $app.querySelectorAll('[data-insured]').forEach(b => b.addEventListener('click', () => {
    state.filterInsured = b.dataset.insured; render();
  }));
  const sortSel = $app.querySelector('#sortSel');
  if (sortSel) sortSel.addEventListener('change', () => { state.sort = sortSel.value; render(); });
  $app.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.id, act = b.dataset.act;
    if (act === 'edit') openPolicyForm(id);
    if (act === 'del') deletePolicy(id);
    if (act === 'view') openPolicyDetail(id);
  }));
}

function deletePolicy(id) {
  const p = state.policies.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`"${p.insurer} ${p.product}" 보험을 삭제할까요?`)) return;
  state.policies = state.policies.filter(x => x.id !== id);
  savePolicies();
  delPhoto(id);
  render();
}

/* === 보험 상세 보기 === */
async function openPolicyDetail(id) {
  const p = state.policies.find(x => x.id === id);
  if (!p) return;
  const rows = (p.coverages || []).map(c => `
    <tr>
      <td><span class="cat-pill">${CATEGORY_ICON[c.category] || '•'} ${esc(CATEGORY_LABEL[c.category] || '기타')}</span></td>
      <td>${esc(c.name)}</td>
      <td class="num">${won(c.amount)}</td>
    </tr>
    ${c.note ? `<tr class="note-row"><td></td><td colspan="2">↳ ${esc(c.note)}</td></tr>` : ''}
  `).join('') || `<tr><td colspan="3" class="muted">등록된 보장이 없어요. 수정에서 추가하세요.</td></tr>`;
  const ev = policyEvents(p).sort((a, b) => a.days - b.days);

  openModal(`
    <div class="modal-head">
      <h2>${esc(p.insurer)} · ${esc(p.product)}</h2>
      <button class="icon-btn" data-close>✕</button>
    </div>
    <div class="detail-meta">
      <span class="badge">${esc(p.type || '기타')}</span>
      ${p.insured ? `<span class="badge soft">👤 ${esc(p.insured)}</span>` : ''}
      ${p.renewal ? `<span class="badge soft">🔁 ${esc(p.renewal)}</span>` : ''}
      ${p.policyNo ? `<span class="badge soft">증권 ${esc(p.policyNo)}</span>` : ''}
    </div>
    ${ev.length ? `<div class="detail-dates">${ev.map(e =>
      `<span class="date-pill ${dueClass(e.days)}">${esc(e.type)} ${esc(e.date)} · ${dueLabel(e.days)}${e.est ? ' (예상)' : ''}</span>`).join('')}</div>` : ''}
    <div id="detailPhoto"></div>
    <table class="cov-table">
      <thead><tr><th>구분</th><th>보장명</th><th class="num">보장금액</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${p.memo ? `<div class="memo-box">📝 ${esc(p.memo)}</div>` : ''}
    <div class="modal-foot">
      <button class="btn-primary" data-edit="${p.id}">✏️ 수정하기</button>
    </div>
  `);
  $modalRoot.querySelector('[data-edit]')?.addEventListener('click', () => { closeModal(); openPolicyForm(id); });
  if (p.hasPhoto) {
    const photo = await getPhoto(id);
    const box = $modalRoot.querySelector('#detailPhoto');
    if (photo && box) box.innerHTML = `<img class="detail-img" src="${photo}" alt="증권 사진" />`;
  }
}

/* === 보험 추가/수정 폼 === */
async function openPolicyForm(id) {
  const editing = !!id;
  const p = editing
    ? structuredCloneSafe(state.policies.find(x => x.id === id))
    : { id: uid(), insurer: '', product: '', type: '실손의료보험', policyNo: '',
        insured: '본인', contractor: '본인', startDate: '', renewal: '비갱신형',
        maturityDate: '', renewalDate: '', premium: '', premiumCycle: '월', memo: '', coverages: [] };

  let photoData = editing && p.hasPhoto ? await getPhoto(p.id) : null;
  let photoDirty = false;

  const typeOpts = POLICY_TYPES.map(t => `<option ${p.type === t ? 'selected' : ''}>${t}</option>`).join('');
  const insurerOpts = KNOWN_INSURERS.map(n => `<option value="${esc(n)}"></option>`).join('');
  const catOpts = (sel) => CATEGORIES.map(c =>
    `<option value="${c.key}" ${sel === c.key ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('');

  function covRow(c = { id: uid(), category: 'diagnosis', name: '', amount: '', note: '' }) {
    return `<div class="cov-row" data-cid="${c.id}">
      <select class="cov-cat">${catOpts(c.category)}</select>
      <input class="cov-name" placeholder="보장명 (예: 암진단비)" value="${esc(c.name)}" />
      <div class="amt-wrap">
        <input class="cov-amt" type="number" inputmode="numeric" placeholder="금액(원)" value="${esc(c.amount)}" />
        <span class="cov-amt-prev">${c.amount ? won(c.amount) : ''}</span>
      </div>
      <input class="cov-note" placeholder="메모 (예: 90일 면책, 본인부담 20%)" value="${esc(c.note)}" />
      <button type="button" class="btn-ghost danger cov-del">삭제</button>
    </div>`;
  }

  openModal(`
    <div class="modal-head">
      <h2>${editing ? '보험 수정' : '보험 추가'}</h2>
      <button class="icon-btn" data-close>✕</button>
    </div>
    <form id="policyForm" class="form">
      <div class="photo-section">
        <div class="cov-head"><h3>📎 증권 사진</h3></div>
        <p class="hint">증권/보장내용 화면을 <b>촬영하거나 갤러리의 캡처(스크린샷) 이미지를 선택</b>할 수 있어요. 사진에서 글자를 읽어 자동 입력도 시도합니다.</p>
        <div id="photoArea"></div>
        <input type="file" id="photoInput" accept="image/*" hidden />
      </div>

      <label>보험회사 <input name="insurer" list="insurerList" value="${esc(p.insurer)}" placeholder="입력하면 회사명이 자동 추천돼요" required /></label>
      <datalist id="insurerList">${insurerOpts}</datalist>
      <label>상품명 <input name="product" value="${esc(p.product)}" placeholder="예: 든든한 암보험" /></label>
      <div class="grid2">
        <label>종류 <select name="type">${typeOpts}</select></label>
        <label>피보험자 <input name="insured" list="insuredList" value="${esc(p.insured)}" placeholder="예: 본인, 배우자, 자녀" /></label>
      </div>
      <datalist id="insuredList">${['본인','배우자','자녀','부모','자녀1','자녀2'].map(v => `<option value="${v}"></option>`).join('')}</datalist>
      <div class="grid2">
        <label>갱신여부
          <select name="renewal">
            ${['비갱신형','갱신형(1년)','갱신형(3년)','갱신형(5년)','갱신형(10년)','모름'].map(r =>
              `<option ${p.renewal === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </label>
        <label>계약자 <input name="contractor" value="${esc(p.contractor)}" placeholder="예: 본인" /></label>
      </div>
      <div class="grid2">
        <label>보험료(원) <input name="premium" type="number" inputmode="numeric" value="${esc(p.premium)}" placeholder="예: 65000" /></label>
        <label>납입주기
          <select name="premiumCycle">
            <option ${p.premiumCycle==='월'?'selected':''}>월</option>
            <option ${p.premiumCycle==='연'?'selected':''}>연</option>
          </select>
        </label>
      </div>
      <div class="grid2">
        <label>보장개시일 <input name="startDate" type="date" value="${esc(p.startDate)}" /></label>
        <label>만기일 <input name="maturityDate" type="date" value="${esc(p.maturityDate)}" /></label>
      </div>
      <div class="grid2">
        <label>다음 갱신일 <input name="renewalDate" type="date" value="${esc(p.renewalDate)}" /></label>
        <label>증권번호 <input name="policyNo" value="${esc(p.policyNo)}" placeholder="선택" /></label>
      </div>
      <p class="hint">만기일·갱신일을 넣으면 "다가오는 일정"으로 알려드려요. (갱신주기를 고르면 다음 갱신일은 자동 추정)</p>

      <div class="cov-head">
        <h3>보장 내용</h3>
        <div class="cov-head-btns">
          <button type="button" class="btn-ghost" id="tplBtn">🧩 템플릿</button>
          <button type="button" class="btn-ghost" id="addCov">＋ 보장</button>
        </div>
      </div>
      <button type="button" class="btn-primary wide" id="covOcrBtn">📋 보장내용 사진·캡처·PDF에서 자동 채우기</button>
      <input type="file" id="covOcrInput" accept="image/*,application/pdf,.pdf" hidden />
      <div id="covOcrStatus" class="hint"></div>
      <p class="hint">보험사 앱/홈페이지의 <b>"보장내용 조회"</b> 화면을 <b>캡처(갤러리)</b> 하거나, <b>보장내용 PDF 파일</b>을 올리면 보장 항목·금액을 자동으로 읽어 채워줘요. (PDF는 글자가 있으면 더 정확하게 인식) · "🧩 템플릿"은 종류별 흔한 보장을 채웁니다.</p>
      <div id="covList">${(p.coverages || []).map(covRow).join('')}</div>

      <label>메모 <textarea name="memo" rows="2" placeholder="기억할 점 (예: 콜센터 1588-0000)">${esc(p.memo)}</textarea></label>

      <div class="modal-foot">
        <button type="button" class="btn-ghost" data-close>취소</button>
        <button type="submit" class="btn-primary">저장</button>
      </div>
    </form>
  `);

  const form = $modalRoot.querySelector('#policyForm');
  const covList = $modalRoot.querySelector('#covList');

  /* 금액 미리보기 */
  covList.addEventListener('input', e => {
    if (e.target.classList.contains('cov-amt')) {
      const prev = e.target.parentElement.querySelector('.cov-amt-prev');
      if (prev) prev.textContent = won(e.target.value);
    }
  });

  /* 사진 영역 */
  const photoArea = $modalRoot.querySelector('#photoArea');
  const photoInput = $modalRoot.querySelector('#photoInput');
  function drawPhoto() {
    if (photoData) {
      photoArea.innerHTML = `
        <div class="photo-preview"><img src="${photoData}" alt="증권 사진 미리보기" /></div>
        <div class="photo-btns">
          <button type="button" class="btn-ghost" id="ocrBtn">📷 사진에서 자동 입력(OCR)</button>
          <button type="button" class="btn-ghost danger" id="photoDel">사진 삭제</button>
        </div>
        <div id="ocrStatus" class="hint"></div>`;
      photoArea.querySelector('#photoDel').onclick = () => { photoData = null; photoDirty = true; drawPhoto(); };
      photoArea.querySelector('#ocrBtn').onclick = runOcrFlow;
    } else {
      photoArea.innerHTML = `<button type="button" class="btn-ghost photo-add" id="photoAdd">＋ 증권 사진 추가</button>`;
      photoArea.querySelector('#photoAdd').onclick = () => photoInput.click();
    }
  }
  photoInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { photoData = await fileToResizedDataUrl(file); photoDirty = true; drawPhoto(); }
    catch (err) { alert('사진을 불러오지 못했어요.'); }
    photoInput.value = '';
  };
  drawPhoto();

  async function runOcrFlow() {
    const status = $modalRoot.querySelector('#ocrStatus');
    status.textContent = '글자 인식 준비 중… (처음엔 시간이 걸려요)';
    try {
      const text = await runOcr(photoData, m => {
        if (m && m.status === 'recognizing text') status.textContent = `인식 중… ${Math.round((m.progress || 0) * 100)}%`;
      });
      const parsed = parseOcr(text);
      const filled = [];
      if (parsed.insurer && !form.insurer.value) { form.insurer.value = parsed.insurer; filled.push('회사명'); }
      if (parsed.product && !form.product.value) { form.product.value = parsed.product; filled.push('상품명'); }
      if (parsed.policyNo && !form.policyNo.value) { form.policyNo.value = parsed.policyNo; filled.push('증권번호'); }
      status.innerHTML = filled.length
        ? `✅ 자동 입력: ${filled.join(', ')} — 값이 맞는지 확인하고 고치세요.`
        : '인식은 됐지만 자동으로 채울 항목을 못 찾았어요. 아래 인식된 글자를 참고해 직접 입력하세요.';
      if (text.trim()) status.innerHTML += `<details class="ocr-text"><summary>인식된 글자 전체 보기</summary><pre>${esc(text)}</pre></details>`;
    } catch (err) {
      status.innerHTML = '⚠️ 글자 인식 기능을 불러오지 못했어요(인터넷 연결이 필요합니다). 직접 입력해 주세요.';
    }
  }

  /* 보장 행 추가/삭제 + 템플릿 */
  function bindCovDel() {
    covList.querySelectorAll('.cov-del').forEach(b => { b.onclick = () => b.closest('.cov-row').remove(); });
  }
  $modalRoot.querySelector('#addCov').addEventListener('click', () => {
    covList.insertAdjacentHTML('beforeend', covRow());
    bindCovDel();
    covList.lastElementChild.querySelector('.cov-name').focus();
  });
  $modalRoot.querySelector('#tplBtn').addEventListener('click', () => {
    const tpl = COVERAGE_TEMPLATES[form.type.value];
    if (!tpl) { alert('이 종류는 준비된 템플릿이 없어요. "＋ 보장"으로 직접 추가하세요.'); return; }
    const existing = new Set([...covList.querySelectorAll('.cov-name')].map(i => i.value.trim()).filter(Boolean));
    let added = 0;
    tpl.forEach(t => {
      if (existing.has(t.name)) return;
      covList.insertAdjacentHTML('beforeend', covRow({ id: uid(), category: t.category, name: t.name, amount: '', note: t.note || '' }));
      added++;
    });
    bindCovDel();
    if (!added) alert('이미 템플릿 보장이 모두 들어 있어요.');
  });

  /* 보장내용 사진 → 보장 자동 채우기 (OCR) */
  const covOcrInput = $modalRoot.querySelector('#covOcrInput');
  $modalRoot.querySelector('#covOcrBtn').addEventListener('click', () => covOcrInput.click());
  covOcrInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = $modalRoot.querySelector('#covOcrStatus');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    status.textContent = isPdf ? 'PDF 분석 준비 중…' : '보장내용 사진 인식 준비 중… (처음엔 시간이 걸려요)';
    try {
      let text;
      if (isPdf) {
        text = await extractTextFromPdf(file, msg => { status.textContent = msg; });
      } else {
        const dataUrl = await fileToResizedDataUrl(file, 1600, 0.85);
        text = await runOcr(dataUrl, m => {
          if (m && m.status === 'recognizing text') status.textContent = `인식 중… ${Math.round((m.progress || 0) * 100)}%`;
        });
      }
      const rows = parseCoverageRows(text);
      if (!rows.length) {
        status.innerHTML = `보장 항목을 찾지 못했어요. ${isPdf ? '다른 PDF(보장내용)이거나 표가 복잡할 수 있어요.' : '더 또렷한 "보장내용 조회" 화면을 찍어보세요.'} 직접 추가도 가능합니다.`
          + (text.trim() ? `<details class="ocr-text"><summary>인식된 글자 보기</summary><pre>${esc(text)}</pre></details>` : '');
      } else {
        const existing = new Set([...covList.querySelectorAll('.cov-name')].map(i => i.value.trim()).filter(Boolean));
        let added = 0;
        rows.forEach(r => {
          if (existing.has(r.name)) return;
          covList.insertAdjacentHTML('beforeend', covRow({ id: uid(), category: r.category, name: r.name, amount: r.amount || '', note: r.note || '' }));
          added++;
        });
        bindCovDel();
        status.innerHTML = `✅ ${added}개 보장을 자동으로 채웠어요. 항목·금액이 맞는지 확인하고 고치세요.`
          + `<details class="ocr-text"><summary>인식된 글자 보기</summary><pre>${esc(text)}</pre></details>`;
      }
    } catch (err) {
      status.innerHTML = '⚠️ 파일을 인식하지 못했어요(인터넷 연결이 필요하며, 암호가 걸린 PDF는 풀고 올려야 해요). 직접 추가해 주세요.';
    }
    covOcrInput.value = '';
  };
  bindCovDel();

  /* 저장 */
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const coverages = [...covList.querySelectorAll('.cov-row')].map(row => ({
      id: row.dataset.cid,
      category: row.querySelector('.cov-cat').value,
      name: row.querySelector('.cov-name').value.trim(),
      amount: row.querySelector('.cov-amt').value,
      note: row.querySelector('.cov-note').value.trim(),
    })).filter(c => c.name);

    const updated = {
      id: p.id,
      insurer: f.insurer.value.trim(), product: f.product.value.trim(), type: f.type.value,
      renewal: f.renewal.value, premium: f.premium.value, premiumCycle: f.premiumCycle.value,
      startDate: f.startDate.value, maturityDate: f.maturityDate.value, renewalDate: f.renewalDate.value,
      policyNo: f.policyNo.value.trim(), insured: f.insured.value.trim(), contractor: f.contractor.value.trim(),
      memo: f.memo.value.trim(), coverages, hasPhoto: !!photoData,
    };
    if (photoDirty) {
      if (photoData) { try { await putPhoto(p.id, photoData); } catch (e2) { alert('사진 저장 공간이 부족할 수 있어요.'); } }
      else await delPhoto(p.id);
    }
    if (editing) { const i = state.policies.findIndex(x => x.id === p.id); state.policies[i] = updated; }
    else state.policies.push(updated);
    savePolicies();
    closeModal();
    setTab('policies');
  });
}

/* ---------- 이미지 리사이즈 / OCR ---------- */
function fileToResizedDataUrl(file, maxDim = 1280, quality = 0.72) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      res(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = rej; img.src = url;
  });
}
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = () => res(window.Tesseract); s.onerror = rej;
    document.head.appendChild(s);
  });
}
async function runOcr(dataUrl, onProgress) {
  const T = await loadTesseract();
  const { data } = await T.recognize(dataUrl, 'kor+eng', { logger: onProgress });
  return data.text || '';
}

/* ---------- PDF에서 글자 추출 (PDF.js, 필요 시 OCR 폴백) ---------- */
const PDFJS_VER = '3.11.174';
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build/pdf.min.js`;
    s.onload = () => {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build/pdf.worker.min.js`;
        res(window.pdfjsLib);
      } catch (e) { rej(e); }
    };
    s.onerror = rej;
    document.head.appendChild(s);
  });
}
/* PDF.js 텍스트 아이템을 좌표 기준으로 줄 단위 복원 (표 구조 보존) */
function itemsToLines(items) {
  const rows = [];
  items.forEach(it => {
    if (!it.str || !it.str.trim()) return;
    const y = Math.round(it.transform[5]);
    let row = rows.find(r => Math.abs(r.y - y) <= 3);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x: it.transform[4], s: it.str });
  });
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => r.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s{2,}/g, ' ').trim())
             .filter(Boolean).join('\n');
}
async function extractTextFromPdf(file, onProgress) {
  const pdfjsLib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const maxPages = Math.min(pdf.numPages, 15);
  let text = '';
  for (let i = 1; i <= maxPages; i++) {
    onProgress && onProgress(`PDF 글자 추출 ${i}/${maxPages}…`);
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    text += '\n' + itemsToLines(tc.items);
  }
  // 글자가 거의 없으면 스캔(이미지) PDF → 페이지를 렌더해 OCR
  const hangul = (text.match(/[가-힣]/g) || []).length;
  if (hangul < 20) {
    text = '';
    const ocrPages = Math.min(pdf.numPages, 8);
    for (let i = 1; i <= ocrPages; i++) {
      onProgress && onProgress(`스캔 PDF 이미지 인식 ${i}/${ocrPages}…`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const t = await runOcr(dataUrl, m => {
        if (m && m.status === 'recognizing text') onProgress && onProgress(`스캔 PDF 인식 ${i}/${ocrPages} · ${Math.round((m.progress || 0) * 100)}%`);
      });
      text += '\n' + t;
    }
  }
  return text;
}
function parseOcr(text) {
  const out = {};
  for (const name of KNOWN_INSURERS) { if (text.includes(name)) { out.insurer = name; break; } }
  const pn = /(?:증권\s*번호|증권번호|계약번호)[^\d]{0,6}([0-9][0-9\- ]{5,})/.exec(text);
  if (pn) out.policyNo = pn[1].replace(/\s/g, '').trim();
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const prod = lines.find(l => /보험/.test(l) && l.length <= 25 && !/회사|증권|약관|주식회사/.test(l));
  if (prod) out.product = prod;
  return out;
}

/* 보장내용 사진(표)에서 보장 항목·금액을 자동 추출 */
function extractAmount(line) {
  let m;
  m = /(\d+)\s*억(?:\s*([\d,]+)\s*만)?/.exec(line);
  if (m) { let v = parseInt(m[1]) * 1e8; if (m[2]) v += parseInt(m[2].replace(/,/g, '')) * 1e4; return { amount: v, str: m[0], index: m.index }; }
  m = /(\d+)\s*천만/.exec(line);
  if (m) return { amount: parseInt(m[1]) * 1e7, str: m[0], index: m.index };
  m = /(\d+)\s*백만/.exec(line);
  if (m) return { amount: parseInt(m[1]) * 1e6, str: m[0], index: m.index };
  m = /([\d,]+)\s*만/.exec(line);
  if (m) { const n = parseInt(m[1].replace(/,/g, '')); if (n) return { amount: n * 1e4, str: m[0], index: m.index }; }
  m = /([\d,]{4,})\s*원/.exec(line);
  if (m) { const n = parseInt(m[1].replace(/,/g, '')); if (n >= 10000) return { amount: n, str: m[0], index: m.index }; }
  return null;
}
function categoryFromName(n) {
  const map = [
    [/(실손|통원|외래|처방|의료비)/, 'actualloss'],
    [/수술/, 'surgery'],
    [/(입원|일당)/, 'hospital'],
    [/(사망|유족)/, 'death'],
    [/(후유장해|장해)/, 'disability'],
    [/(골절|상해|깁스|화상)/, 'injury'],
    [/(운전|교통|벌금|변호사)/, 'driving'],
    [/(화재|재물|누수|도난)/, 'fire'],
    [/(배상|일상생활)/, 'liability'],
    [/(치아|임플란트|보철|크라운|틀니)/, 'dental'],
    [/(간병|요양|치매)/, 'care'],
    [/(암|뇌|심장|뇌혈관|허혈|진단)/, 'diagnosis'],
  ];
  for (const [re, c] of map) if (re.test(n)) return c;
  return 'etc';
}
/* 보장 줄이 아닌 것(보험료·계약정보·설명 조각)을 걸러내는 키워드 — 보장명에만 적용 */
const COV_SKIP = /(보험료|적립|합계|납입|수금|환급|수익자|주민|계약자|계약번호|보험기간|주소|직업|단체|콜센터|홈페이지|대리점|지점|발행|보험증권|증권|약관|공시이율|책임준비금|상품설명서|담보명|페이지|기본사항|서열|전체피보험자|발급|제출|가입금액|한도|공제|평균|차감|본인부담|해당액|실손보상|지급률|초과|차액)/;
/*
 * 보장내용 표(사진 OCR/PDF 텍스트)에서 보장 행을 추출.
 *  - 한 줄에 "보장명 + 가입금액 + (납기·만기) + 보장내용" 형태를 가정
 *  - 보장명 = 금액 앞부분, 분류는 보장명+설명을 함께 보고 판단
 */
function parseCoverageRows(text) {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const rows = [];
  for (const raw of lines) {
    const amt = extractAmount(raw);
    if (!amt) continue;                       // 가입금액 없는 줄(설명/잘린행)은 제외
    let name = raw.slice(0, amt.index);
    const rest = raw.slice(amt.index + amt.str.length);
    name = name.replace(/^\d+\s+/, '').replace(/^[\s.\-·•|×]+/, '')
               .replace(/\s*\d+\s*(일당|일|회|년|세)\s*$/, '')
               .replace(/[\s|]+$/, '').replace(/\s{2,}/g, ' ').trim();
    const nk = name.replace(/\s/g, '');
    if (nk.length < 2 || nk.length > 24 || !/[가-힣]/.test(nk)) continue;
    if (COV_SKIP.test(nk)) continue;
    const note = rest.replace(/^[\s원:]+/, '').replace(/\s{2,}/g, ' ').trim();
    rows.push({ category: categoryFromName(nk + ' ' + note), name: name.slice(0, 40), amount: amt.amount, note: note.slice(0, 50) });
  }
  const seen = new Set();
  return rows.filter(r => { const k = r.name.replace(/\s/g, '') + '|' + r.amount; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 60);
}

/* ---------- 보험 목록 한번에 가져오기 (반자동 등록) ---------- */
function detectType(line) {
  const map = [
    ['실손', '실손의료보험'], ['실비', '실손의료보험'],
    ['암', '암보험'], ['종신', '종신보험'], ['정기', '정기보험'],
    ['운전자', '운전자보험'], ['자동차', '자동차보험'], ['화재', '화재보험'],
    ['치아', '치아보험'], ['간병', '간병/장기요양보험'], ['요양', '간병/장기요양보험'],
    ['어린이', '어린이보험'], ['자녀', '어린이보험'], ['태아', '어린이보험'],
    ['연금', '연금/저축보험'], ['저축', '연금/저축보험'],
    ['상해', '상해보험'], ['건강', '질병보험'], ['질병', '질병보험'],
  ];
  for (const [kw, t] of map) if (line.includes(kw)) return t;
  return '기타';
}
function parseBulkText(text) {
  return text.split(/\n+/).map(l => l.trim()).filter(l => l.length >= 2 && /[가-힣A-Za-z]/.test(l)).map(line => {
    let insurer = '';
    for (const n of KNOWN_INSURERS) { if (line.includes(n)) { insurer = n; break; } }
    let product = line;
    if (insurer) product = line.replace(insurer, '').trim();
    product = product.replace(/^[\-·•\s,|]+/, '').replace(/[\-·•\s,|]+$/, '').trim();
    return { insurer, product, type: detectType(line) };
  });
}
function openBulkImport() {
  openModal(`
    <div class="modal-head"><h2>📥 보험 목록 한번에 가져오기</h2><button class="icon-btn" data-close>✕</button></div>
    <div class="info-card">
      <p><b>진짜 "자동 조회"는 마이데이터 사업자(토스·뱅크샐러드 등)만 가능</b>해요. 이 앱은 폰에만 저장되는 개인 도구라 보험사에서 직접 끌어오진 못합니다. 대신 아래 방법으로 <b>한 번에 여러 건</b>을 등록할 수 있어요.</p>
      <ol class="steps">
        <li><b>내보험찾아줌</b>(보험협회 공식)에서 내 전체 보험 목록을 확인 →
          <a href="https://cont.insure.or.kr/" target="_blank" rel="noopener">내보험찾아줌 열기 ↗</a></li>
        <li>또는 보험사 앱의 "보유계약 목록" 화면을 봅니다.</li>
        <li>회사·상품 목록을 <b>복사해서 아래에 붙여넣고</b> "분석하기"를 누르세요. (한 줄에 한 보험)</li>
      </ol>
    </div>
    <textarea id="bulkText" class="bulk-text" rows="6" placeholder="예)&#10;삼성생명 더건강한종신보험&#10;현대해상 굿앤굿실손의료비&#10;DB손해보험 참좋은운전자보험"></textarea>
    <div class="modal-foot">
      <button type="button" class="btn-ghost" data-close>취소</button>
      <button type="button" class="btn-primary" id="bulkParse">분석하기</button>
    </div>
    <div id="bulkPreview"></div>
  `);
  $modalRoot.querySelector('#bulkParse').addEventListener('click', () => {
    const text = $modalRoot.querySelector('#bulkText').value;
    const rows = parseBulkText(text);
    const box = $modalRoot.querySelector('#bulkPreview');
    if (!rows.length) { box.innerHTML = `<p class="hint">인식할 줄이 없어요. 한 줄에 하나씩 "회사 상품명"을 붙여넣어 보세요.</p>`; return; }
    const typeSel = (sel) => POLICY_TYPES.map(t => `<option ${sel === t ? 'selected' : ''}>${t}</option>`).join('');
    box.innerHTML = `
      <h3 class="sec-h">미리보기 (${rows.length}건) — 확인 후 고치고 등록하세요</h3>
      <div id="bulkRows">${rows.map((r, i) => `
        <div class="bulk-row" data-i="${i}">
          <input class="b-insurer" list="insurerList2" value="${esc(r.insurer)}" placeholder="회사" />
          <input class="b-product" value="${esc(r.product)}" placeholder="상품명" />
          <select class="b-type">${typeSel(r.type)}</select>
          <button type="button" class="btn-ghost danger b-del">✕</button>
        </div>`).join('')}</div>
      <datalist id="insurerList2">${KNOWN_INSURERS.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      <div class="modal-foot">
        <button type="button" class="btn-primary" id="bulkAdd">＋ ${rows.length}건 모두 등록</button>
      </div>
      <p class="hint">등록 후 각 보험을 열어 보장 내용·금액을 채우면 됩니다. (종류별 "🧩 템플릿" 활용)</p>`;
    box.querySelectorAll('.b-del').forEach(b => b.addEventListener('click', () => b.closest('.bulk-row').remove()));
    box.querySelector('#bulkAdd').addEventListener('click', () => {
      const added = [...box.querySelectorAll('.bulk-row')].map(row => ({
        insurer: row.querySelector('.b-insurer').value.trim(),
        product: row.querySelector('.b-product').value.trim(),
        type: row.querySelector('.b-type').value,
      })).filter(r => r.insurer || r.product);
      if (!added.length) { alert('등록할 항목이 없어요.'); return; }
      added.forEach(r => state.policies.push({
        id: uid(), insurer: r.insurer, product: r.product, type: r.type, policyNo: '',
        insured: '본인', contractor: '본인', startDate: '', renewal: '모름',
        maturityDate: '', renewalDate: '', premium: '', premiumCycle: '월', memo: '', coverages: [],
      }));
      savePolicies();
      closeModal();
      setTab('policies');
      alert(`${added.length}건을 등록했어요. 각 보험을 열어 보장 내용을 채워주세요.`);
    });
  });
}

/* ---------- 보험료 납입 현황 대시보드 ---------- */
function monthlyOf(p) { return p.premiumCycle === '연' ? (Number(p.premium) || 0) / 12 : (Number(p.premium) || 0); }
function groupSum(keyFn) {
  const m = {};
  state.policies.forEach(p => { const k = keyFn(p) || '미지정'; m[k] = (m[k] || 0) + monthlyOf(p); });
  return Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}
function barList(entries, total) {
  const max = Math.max(1, ...entries.map(e => e[1]));
  return entries.map(([label, v]) => `
    <div class="pm-row">
      <div class="pm-row-top"><span>${esc(label)}</span><b>${won(Math.round(v))}</b></div>
      <div class="bar"><div class="bar-fill" style="width:${Math.round(v / max * 100)}%"></div></div>
      <div class="pm-pct">${total ? Math.round(v / total * 100) : 0}%</div>
    </div>`).join('');
}
function openPremiumDashboard() {
  const totalMonthly = state.policies.reduce((s, p) => s + monthlyOf(p), 0);
  const byMember = groupSum(p => (p.insured || '').trim());
  const byType = groupSum(p => p.type);
  const perPolicy = state.policies.map(p => ({ p, m: monthlyOf(p) })).filter(x => x.m > 0).sort((a, b) => b.m - a.m);
  openModal(`
    <div class="modal-head"><h2>💳 보험료 납입 현황</h2><button class="icon-btn" data-close>✕</button></div>
    <div class="pm-totals">
      <div><span>월 합계</span><strong>${won(Math.round(totalMonthly))}</strong></div>
      <div><span>연 환산</span><strong>${won(Math.round(totalMonthly * 12))}</strong></div>
    </div>
    ${byMember.length ? `<h3 class="sec-h">👨‍👩‍👧 가족(피보험자)별</h3>${barList(byMember, totalMonthly)}` : ''}
    <h3 class="sec-h">📂 종류별</h3>${barList(byType, totalMonthly)}
    <h3 class="sec-h">📄 보험별 (월 환산, 높은순)</h3>
    <ul class="pm-policies">
      ${perPolicy.map(({ p, m }) => `<li>
        <span>${esc(p.insurer)} ${esc(p.product)}${p.premiumCycle === '연' ? ' <span class="muted">(연납)</span>' : ''}</span>
        <b>${won(Math.round(m))}</b></li>`).join('') || '<li class="muted">보험료가 입력된 보험이 없어요.</li>'}
    </ul>
    <p class="disclaimer">※ 연납 보험은 월 기준으로 환산해 합산했습니다. 입력한 보험료 기준이며 실제 청구액과 다를 수 있어요.</p>
  `);
}

/* === 2) 보장 한눈에 보기 + 중복·공백 분석 === */
function analyzeCoverage() {
  const byCat = {};
  state.policies.forEach(p => (p.coverages || []).forEach(c => {
    (byCat[c.category] = byCat[c.category] || new Map()).set(p.id, p);
  }));
  const dups = [];
  Object.entries(byCat).forEach(([cat, m]) => { if (m.size >= 2) dups.push({ cat, policies: [...m.values()] }); });
  const gaps = RECOMMENDED_COVERAGE.filter(r => !byCat[r.cat]);
  return { dups, gaps, hasAny: Object.keys(byCat).length > 0 };
}
function renderAnalysis() {
  const { dups, gaps, hasAny } = analyzeCoverage();
  if (!hasAny) return '';
  const dupHtml = dups.map(d => {
    const names = d.policies.map(p => `${esc(p.insurer)} ${esc(p.product)}`).join(', ');
    const special = d.cat === 'actualloss'
      ? '<div class="ana-note">실손보험은 여러 개 가입해도 실제 쓴 의료비 한도 내에서 나눠(비례) 보상돼요. <b>중복으로 더 받지 못하니</b> 하나로 정리하면 보험료를 아낄 수 있어요.</div>'
      : '<div class="ana-note">정액 보장(진단비·일당 등)이라면 중복도 각각 받을 수 있어요. 다만 보험료가 과한지 점검해 보세요.</div>';
    return `<div class="ana-card warn">
      <div class="ana-title">⚠️ 중복 가능 · ${CATEGORY_ICON[d.cat]} ${CATEGORY_LABEL[d.cat]}</div>
      <div class="ana-sub">${names}</div>${special}</div>`;
  }).join('');
  const gapHtml = gaps.map(g => `
    <div class="ana-card gap">
      <div class="ana-title">🕳️ 보장 공백 · ${CATEGORY_ICON[g.cat]} ${CATEGORY_LABEL[g.cat]} 미보유</div>
      <div class="ana-sub">${esc(g.why)}</div>
    </div>`).join('');
  const ok = !dups.length && !gaps.length
    ? '<div class="ana-card good"><div class="ana-title">✅ 큰 중복·공백이 보이지 않아요</div></div>' : '';
  return `<section class="analysis">
    <h3 class="sec-h">🔬 중복 · 공백 분석</h3>
    ${dupHtml}${gapHtml}${ok}
    <p class="disclaimer">※ 입력한 정보만으로 판단한 참고용 분석입니다. 보장·해지 권유가 아니며, 가입·해지는 본인 상황과 약관을 따져 신중히 결정하세요.</p>
  </section>`;
}
/* 🎯 나이대 대비 보장 수준 (참고 가이드) */
function renderAgeBenchmark() {
  const age = profileAge();
  if (!age) {
    return `<section class="bench">
      <h3 class="sec-h">🎯 나이대 대비 보장 수준</h3>
      <div class="ana-card gap">
        <div class="ana-title">나이를 알려주시면 또래 권장 보장과 비교해 드려요</div>
        <div class="ana-sub">출생연도만 한 번 입력하면 됩니다. (기기에만 저장)</div>
        <button class="btn-ghost" id="setAgeBtn" style="margin-top:10px">👤 나이 설정</button>
      </div>
    </section>`;
  }
  const band = ageBand(age);
  const bm = computeBenchmark(band);
  const { sum, exist } = coverageByCategory();
  const p = state.profile || {};
  const married = !!p.married, children = Math.max(0, parseInt(p.children, 10) || 0);
  const genderNote = p.gender && GENDER_NOTES[p.gender] ? GENDER_NOTES[p.gender] : '';

  const amtRows = ['death', 'diagnosis', 'disability'].map(cat => {
    const have = sum[cat] || 0, rec = bm[cat], ratio = rec ? have / rec : 0;
    const st = have === 0 ? ['❗', '없음', 'due-red']
      : ratio >= 1 ? ['✅', '충분', 'due-soft']
      : ratio >= 0.5 ? ['⚠️', '다소 부족', 'due-orange']
      : ['❗', '부족', 'due-red'];
    const pct = Math.min(100, Math.round(ratio * 100));
    return `<div class="bench-row">
      <div class="bench-top"><span>${BENCHMARK_INFO[cat].label}</span><span class="bench-st ${st[2]}">${st[0]} ${st[1]}</span></div>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="bench-sub">내 보장 ${won(have) || '0원'} · 권장 ${won(rec)} (${Math.round(ratio * 100)}%)</div>
    </div>`;
  }).join('');

  const presRows = BENCHMARK_PRESENCE.map(cat => {
    const has = exist.has(cat);
    return `<div class="bench-row">
      <div class="bench-top"><span>${BENCHMARK_INFO[cat].label}</span><span class="bench-st ${has ? 'due-soft' : 'due-red'}">${has ? '✅ 보유' : '❗ 미보유'}</span></div>
      <div class="bench-sub">${BENCHMARK_INFO[cat].why}</div>
    </div>`;
  }).join('');

  const cond = `만 ${age}세 · ${esc(band)} · ${p.gender === 'M' ? '남' : p.gender === 'F' ? '여' : '성별-'} · ${married ? '기혼' : '미혼'} · 자녀 ${children}명`;

  return `<section class="bench">
    <h3 class="sec-h">🎯 내 조건 맞춤 권장 대비 보장 <button class="bench-edit" id="setAgeBtn">(${cond} · 변경)</button></h3>
    ${amtRows}
    ${genderNote ? `<div class="bench-note">💡 ${esc(genderNote)}</div>` : ''}
    <div class="bench-pres-h">아래는 "있으면 좋은" 기본 보장</div>
    ${presRows}
    <details class="ocr-text"><summary>권장 기준의 근거·출처</summary>
      <div class="bench-src">
        <p><b>사망보장</b> = 본인 정리자금 3천만 + 배우자(기혼) 1억 + 자녀 1인당 5천만 (× 연령 계수). 가장 부재 시 가족 자립에 약 3년·2억원 수준 필요(통계청 가계동향조사 기반, 업계 통용)에 근거.</p>
        <p><b>중대질병 진단비</b> 기본 5천만(× 연령 계수): 연소득의 1.2~2배 권장(보험업계), 설계사 평균 3천만~5천만원.</p>
        <p><b>상해 후유장해</b> 기본 1억(× 연령 계수).</p>
        <p>출처: 생명보험협회 생명보험성향조사·통계(klia.or.kr), 보험연구원(kiri.or.kr), 언론 보도 등 공개자료 참고. 성별·가족구성 조합별 공식 평균표는 공개돼 있지 않아, 공개 통계로 기본액을 잡고 가족구성은 필요보장 산정원리로 조정한 <b>추정 모델</b>입니다.</p>
      </div>
    </details>
    <p class="disclaimer">※ 통계 평균 자체가 아니라 <b>공개자료 기반 추정 참고치</b>입니다. 소득·자산·건강에 따라 적정 보장은 크게 다르며, 보장·해지 권유나 재무 조언이 아닙니다.</p>
  </section>`;
}
function openProfileForm() {
  const p = state.profile || {};
  const cur = p.birthYear || '';
  const children = (p.children !== undefined && p.children !== null) ? p.children : '';
  openModal(`
    <div class="modal-head"><h2>👤 내 정보 (맞춤 비교용)</h2><button class="icon-btn" data-close>✕</button></div>
    <p class="hint">아래 정보로 "보장보기"에서 내 조건에 맞춘 권장 보장과 비교해 드려요. (이 기기에만 저장)</p>
    <form id="profileForm" class="form">
      <div class="grid2">
        <label>출생연도 <input name="birthYear" type="number" inputmode="numeric" value="${esc(cur)}" placeholder="예: 1985" required /></label>
        <label>성별
          <select name="gender">
            <option value="" ${!p.gender ? 'selected' : ''}>선택 안 함</option>
            <option value="M" ${p.gender === 'M' ? 'selected' : ''}>남성</option>
            <option value="F" ${p.gender === 'F' ? 'selected' : ''}>여성</option>
          </select>
        </label>
      </div>
      <div class="grid2">
        <label>결혼 여부
          <select name="married">
            <option value="" ${!p.married ? 'selected' : ''}>미혼</option>
            <option value="1" ${p.married ? 'selected' : ''}>기혼</option>
          </select>
        </label>
        <label>자녀 수 <input name="children" type="number" inputmode="numeric" min="0" value="${esc(children)}" placeholder="예: 2" /></label>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn-ghost" data-close>취소</button>
        <button type="submit" class="btn-primary">저장</button>
      </div>
    </form>
  `);
  $modalRoot.querySelector('#profileForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const by = parseInt(f.birthYear.value, 10);
    const thisYear = new Date().getFullYear();
    if (!by || by < 1900 || by > thisYear) { alert('출생연도를 올바르게 입력해 주세요. (예: 1985)'); return; }
    state.profile = {
      birthYear: by,
      gender: f.gender.value,
      married: f.married.value === '1',
      children: Math.max(0, parseInt(f.children.value, 10) || 0),
    };
    saveProfile();
    closeModal();
    setTab('coverage');
  });
}

function renderCoverage() {
  const byCat = {};
  state.policies.forEach(p => (p.coverages || []).forEach(c => {
    (byCat[c.category] = byCat[c.category] || []).push({ ...c, _p: p });
  }));
  const keys = CATEGORIES.map(c => c.key).filter(k => byCat[k]?.length);
  if (!keys.length) {
    $app.innerHTML = renderAgeBenchmark() + emptyState('아직 보장 정보가 없어요', '"내 보험" 탭에서 보험과 보장을 추가하면 여기에 정리돼요.');
    $app.querySelector('#setAgeBtn')?.addEventListener('click', openProfileForm);
    return;
  }
  // 카테고리 정액 합계의 최댓값(막대 그래프 기준)
  const totals = keys.map(k => byCat[k].reduce((s, c) => s + (Number(c.amount) || 0), 0));
  const maxTotal = Math.max(1, ...totals);
  const blocks = keys.map((k, idx) => {
    const items = byCat[k];
    const total = totals[idx];
    const pct = Math.round((total / maxTotal) * 100);
    const rows = items.map(c => `
      <li>
        <div class="cov-line">
          <span class="cov-line-name">${esc(c.name)}</span>
          <span class="cov-line-amt">${won(c.amount)}</span>
        </div>
        <div class="cov-line-sub">${esc(c._p.insurer)} · ${esc(c._p.product)}${c.note ? ' · ' + esc(c.note) : ''}</div>
      </li>`).join('');
    return `<section class="cov-block">
      <div class="cov-block-head">
        <h3>${CATEGORY_ICON[k]} ${CATEGORY_LABEL[k]}</h3>
        <span class="cov-block-total">정액 합계 ${won(total) || '-'}</span>
      </div>
      ${total ? `<div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>` : ''}
      <ul class="cov-list">${rows}</ul>
    </section>`;
  }).join('');
  $app.innerHTML = renderAgeBenchmark() + renderAnalysis() + `<h3 class="sec-h">🛡️ 카테고리별 보장</h3>` + blocks +
    `<p class="disclaimer">※ "정액 합계"는 진단비·일당처럼 금액이 정해진 보장의 단순 합계입니다. 실손은 실제 비용 기준이라 합산 의미가 다를 수 있어요.</p>`;
  $app.querySelector('#setAgeBtn')?.addEventListener('click', openProfileForm);
}

/* === 3) 상황별 보장 찾기 === */
function renderSituations() {
  const cards = SITUATIONS.map(s =>
    `<button class="sit-card" data-sit="${s.id}">
      <span class="sit-ico">${s.icon}</span>
      <span class="sit-title">${esc(s.title)}</span>
      <span class="sit-arrow">›</span>
    </button>`).join('');
  $app.innerHTML = `
    <p class="lead">어떤 일이 생겼나요? 상황을 고르면 <b>내가 가진 보험 중 해당되는 보장</b>과 청구 방법을 알려드려요.</p>
    <div class="sit-grid">${cards}</div>`;
  $app.querySelectorAll('.sit-card').forEach(b => b.addEventListener('click', () => openSituation(b.dataset.sit)));
}
function matchPoliciesForSituation(sit) {
  const results = [];
  state.policies.forEach(p => {
    const matched = (p.coverages || []).filter(c => {
      if (sit.cats.includes(c.category)) return true;
      const hay = (c.name + ' ' + (c.note || ''));
      return sit.keywords.some(kw => hay.includes(kw));
    });
    if (matched.length) results.push({ p, matched });
  });
  return results;
}
function openSituation(id) {
  const sit = SITUATIONS.find(s => s.id === id);
  if (!sit) return;
  const results = matchPoliciesForSituation(sit);
  const matchHtml = results.length
    ? results.map(r => `
        <div class="match-card">
          <div class="match-head">${esc(r.p.insurer)} · ${esc(r.p.product)}${r.p.insured ? ` <span class="muted">(${esc(r.p.insured)})</span>` : ''}</div>
          <ul>
            ${r.matched.map(c => `<li>
              <span>${CATEGORY_ICON[c.category] || '•'} ${esc(c.name)}</span>
              <b>${won(c.amount)}</b>
              ${c.note ? `<div class="match-note">↳ ${esc(c.note)}</div>` : ''}
            </li>`).join('')}
          </ul>
        </div>`).join('')
    : `<div class="no-match">
        <p>이 상황에 바로 연결되는 보장을 못 찾았어요. 😶</p>
        <p class="hint">증권을 다시 확인하거나, 보험사 콜센터에 "이 경우 보장되나요?"라고 문의해 보세요.</p>
      </div>`;
  openModal(`
    <div class="modal-head">
      <h2>${sit.icon} ${esc(sit.title)}</h2>
      <button class="icon-btn" data-close>✕</button>
    </div>
    <h3 class="sec-h">✅ 내 보험에서 받을 수 있는 보장</h3>
    ${matchHtml}
    <button type="button" class="btn-primary wide" id="makeClaim">🧾 이 건으로 청구 체크리스트 만들기</button>
    <h3 class="sec-h">🧾 청구 준비 / 절차</h3>
    <ol class="steps">${sit.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <h3 class="sec-h">⚠️ 놓치기 쉬운 점</h3>
    <ul class="cautions">${sit.cautions.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
    <p class="disclaimer">※ 일반적인 안내입니다. 실제 지급 여부는 약관과 보험사 심사로 결정돼요.</p>
  `);
  $modalRoot.querySelector('#makeClaim').addEventListener('click', () => createClaimFromSituation(sit));
}

/* === 4) 용어 사전 === */
function renderGlossary() {
  $app.innerHTML = `
    <div class="search-wrap">
      <input id="glossarySearch" placeholder="🔍 용어 검색 (예: 실손, 면책, 자기부담)" />
    </div>
    <div id="glossaryList"></div>`;
  const $list = document.getElementById('glossaryList');
  const draw = (q = '') => {
    const qq = q.trim();
    const items = GLOSSARY.filter(g => !qq || g.term.includes(qq) || g.desc.includes(qq));
    $list.innerHTML = items.length
      ? items.map(g => `
          <details class="term">
            <summary>
              <span class="term-name">${esc(g.term)}</span>
              ${(g.tags || []).map(t => `<span class="tag tag-${t === '주의' ? 'warn' : t === '핵심' ? 'key' : 'base'}">${esc(t)}</span>`).join('')}
            </summary>
            <p>${esc(g.desc)}</p>
          </details>`).join('')
      : emptyState('검색 결과가 없어요', '다른 단어로 찾아보세요.');
  };
  draw();
  document.getElementById('glossarySearch').addEventListener('input', e => draw(e.target.value));
}

/* ---------- 보험금 청구 도우미 ---------- */
function claimsSectionHtml() {
  const active = state.claims.filter(c => c.status !== '지급 완료');
  if (!active.length) return '';
  return `<section class="claims-box">
    <div class="alert-head">🧾 진행 중인 청구 <span>${active.length}건</span></div>
    ${active.map(c => {
      const done = c.steps.filter(s => s.done).length;
      return `<button class="claim-row" data-claim="${c.id}">
        <span class="claim-ico">${c.icon || '🧾'}</span>
        <span class="claim-text"><b>${esc(c.title)}</b><span class="claim-prog">${esc(c.status)} · 준비 ${done}/${c.steps.length}</span></span>
        <span class="sit-arrow">›</span>
      </button>`;
    }).join('')}
  </section>`;
}
function bindClaimsSection() {
  $app.querySelectorAll('[data-claim]').forEach(b => b.addEventListener('click', () => openClaim(b.dataset.claim)));
}
function createClaimFromSituation(sit) {
  const claim = {
    id: uid(), title: sit.title, icon: sit.icon, situationId: sit.id,
    status: '준비 중',
    steps: sit.steps.map(t => ({ text: t, done: false })),
    memo: '', createdAt: new Date().toISOString().slice(0, 10),
  };
  state.claims.unshift(claim);
  saveClaims();
  openClaim(claim.id);
}
function openClaim(id) {
  const c = state.claims.find(x => x.id === id);
  if (!c) return;
  const statusOpts = CLAIM_STATUSES.map(s => `<option ${c.status === s ? 'selected' : ''}>${s}</option>`).join('');
  openModal(`
    <div class="modal-head"><h2>${c.icon || '🧾'} ${esc(c.title)}</h2><button class="icon-btn" data-close>✕</button></div>
    <div class="claim-meta">
      <label class="claim-status">진행 상태
        <select id="claimStatus">${statusOpts}</select>
      </label>
      <span class="muted">시작 ${esc(c.createdAt)}</span>
    </div>
    <h3 class="sec-h">준비물 / 절차 체크리스트</h3>
    <ul class="checklist" id="checklist">
      ${c.steps.map((s, i) => `
        <li class="${s.done ? 'done' : ''}" data-i="${i}">
          <button type="button" class="chk" data-i="${i}">${s.done ? '☑' : '☐'}</button>
          <span>${esc(s.text)}</span>
          <button type="button" class="step-del" data-i="${i}" title="삭제">✕</button>
        </li>`).join('')}
    </ul>
    <div class="add-step">
      <input id="newStep" placeholder="할 일 추가 (예: 진단서 발급)" />
      <button type="button" class="btn-ghost" id="addStep">추가</button>
    </div>
    <label>메모 <textarea id="claimMemo" rows="2" placeholder="청구번호, 담당자, 통화 내용 등">${esc(c.memo)}</textarea></label>
    <div class="modal-foot">
      <button type="button" class="btn-ghost danger" id="claimDel">🗑️ 청구 삭제</button>
      <button type="button" class="btn-primary" data-close id="claimDone">확인</button>
    </div>
  `);
  const save = () => { saveClaims(); if (state.tab === 'policies') render(); };
  $modalRoot.querySelector('#claimStatus').addEventListener('change', e => { c.status = e.target.value; save(); });
  $modalRoot.querySelector('#claimMemo').addEventListener('input', e => { c.memo = e.target.value; saveClaims(); });
  $modalRoot.querySelectorAll('.chk').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i; c.steps[i].done = !c.steps[i].done; save(); openClaim(id);
  }));
  $modalRoot.querySelectorAll('.step-del').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i; c.steps.splice(i, 1); save(); openClaim(id);
  }));
  $modalRoot.querySelector('#addStep').addEventListener('click', () => {
    const v = $modalRoot.querySelector('#newStep').value.trim();
    if (!v) return; c.steps.push({ text: v, done: false }); save(); openClaim(id);
  });
  $modalRoot.querySelector('#claimDel').addEventListener('click', () => {
    if (!confirm('이 청구 기록을 삭제할까요?')) return;
    state.claims = state.claims.filter(x => x.id !== id); save(); closeModal();
  });
}
function openClaimsList() {
  if (!state.claims.length) { alert('저장된 청구 기록이 없어요. "상황별" 탭에서 상황을 고른 뒤 "청구 체크리스트 만들기"로 시작할 수 있어요.'); return; }
  openModal(`
    <div class="modal-head"><h2>🧾 청구 내역</h2><button class="icon-btn" data-close>✕</button></div>
    <div class="claims-list">
      ${state.claims.map(c => {
        const done = c.steps.filter(s => s.done).length;
        return `<button class="claim-row" data-claim="${c.id}">
          <span class="claim-ico">${c.icon || '🧾'}</span>
          <span class="claim-text"><b>${esc(c.title)}</b><span class="claim-prog">${esc(c.status)} · 준비 ${done}/${c.steps.length} · ${esc(c.createdAt)}</span></span>
          <span class="sit-arrow">›</span>
        </button>`;
      }).join('')}
    </div>
  `);
  $modalRoot.querySelectorAll('[data-claim]').forEach(b => b.addEventListener('click', () => openClaim(b.dataset.claim)));
}

/* ---------- 모달 ---------- */
function openModal(html) {
  $modalRoot.innerHTML = `<div class="modal-overlay"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  document.body.classList.add('modal-open');
  $modalRoot.querySelector('.modal-overlay').addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) closeModal();
  });
  $modalRoot.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
}
function closeModal() {
  $modalRoot.innerHTML = '';
  document.body.classList.remove('modal-open');
}

/* ---------- 알림 ---------- */
function checkAndNotify(force) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const soon = upcomingEvents(0, 7);
  if (!soon.length) return;
  const today = new Date().toISOString().slice(0, 10);
  if (!force && localStorage.getItem('notifiedOn') === today) return;
  localStorage.setItem('notifiedOn', today);
  const e = soon[0];
  const extra = soon.length > 1 ? ` 외 ${soon.length - 1}건` : '';
  try {
    new Notification('보험 일정 알림', {
      body: `${e.policy.insurer} ${e.policy.product} · ${e.type} ${dueLabel(e.days)}${extra}`,
      icon: './icon.svg',
    });
  } catch (e2) {}
}
async function enableNotifications() {
  if (!('Notification' in window)) { alert('이 브라우저는 알림을 지원하지 않아요.'); return; }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    localStorage.removeItem('notifiedOn'); checkAndNotify(true);
    alert('알림을 켰어요. 임박한 갱신·만기(7일 이내)가 있으면 앱을 열 때 알려드려요.');
  } else {
    alert('알림 권한이 꺼져 있어요. 폰 설정에서 이 앱(사이트)의 알림을 허용할 수 있어요.');
  }
}

/* ---------- 메뉴 / 백업 ---------- */
function openMenu() {
  const notifState = ('Notification' in window)
    ? (Notification.permission === 'granted' ? '켜짐' : Notification.permission === 'denied' ? '차단됨' : '꺼짐')
    : '미지원';
  openModal(`
    <div class="modal-head"><h2>메뉴 · 설정</h2><button class="icon-btn" data-close>✕</button></div>
    <div class="menu-list">
      <button class="menu-item" id="bulkBtn">📥 보험 목록 한번에 가져오기</button>
      <button class="menu-item" id="claimsBtn">🧾 청구 내역 보기</button>
      <button class="menu-item" id="profileBtn">👤 내 정보 (나이대 비교)</button>
      <button class="menu-item" id="notifBtn">🔔 일정 알림 허용 <span class="menu-state">현재: ${notifState}</span></button>
      <button class="menu-item" id="exportBtn">⬇️ 데이터 내보내기 (백업)</button>
      <button class="menu-item" id="importBtn">⬆️ 백업 파일 불러오기</button>
      <button class="menu-item danger" id="resetBtn">🗑️ 전체 초기화</button>
    </div>
    <input type="file" id="importFile" accept="application/json" hidden />
    <p class="hint">데이터는 이 기기(브라우저)에만 저장됩니다. 백업에는 보험·청구 정보가 담기며, 증권 사진은 용량이 커서 포함되지 않아요.</p>
  `);
  document.getElementById('bulkBtn').onclick = openBulkImport;
  document.getElementById('claimsBtn').onclick = openClaimsList;
  document.getElementById('profileBtn').onclick = openProfileForm;
  document.getElementById('notifBtn').onclick = enableNotifications;
  document.getElementById('exportBtn').onclick = exportData;
  document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = importData;
  document.getElementById('resetBtn').onclick = () => {
    if (confirm('모든 보험·청구 데이터를 지울까요? 되돌릴 수 없어요.')) {
      state.policies.forEach(p => delPhoto(p.id));
      state.policies = []; state.claims = [];
      savePolicies(); saveClaims();
      closeModal(); setTab('policies');
    }
  };
}
function exportData() {
  const payload = { policies: state.policies, claims: state.claims, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `내보험_백업_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const policies = Array.isArray(data) ? data : data.policies;   // 구버전(배열) 호환
      if (!Array.isArray(policies)) throw new Error('형식 오류');
      if (confirm('불러온 데이터로 교체할까요? (현재 데이터는 사라집니다)')) {
        state.policies = policies;
        state.claims = Array.isArray(data.claims) ? data.claims : [];
        savePolicies(); saveClaims();
        closeModal(); setTab('policies');
      }
    } catch (err) {
      alert('백업 파일을 읽을 수 없어요. 올바른 JSON 파일인지 확인하세요.');
    }
  };
  reader.readAsText(file);
}

/* ---------- 초기화 ---------- */
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
$fab.addEventListener('click', () => openPolicyForm());
document.getElementById('menuBtn').addEventListener('click', openMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

setTab('policies');
checkAndNotify(false);
