/* =========================================================================
 * app.js — 내 보험 한눈에 (PWA)
 *  - 보험 데이터는 브라우저(localStorage)에, 증권 사진은 IndexedDB에 저장됩니다.
 *  - 어떤 정보도 서버로 전송되지 않습니다.
 * =======================================================================*/
'use strict';

const STORE_KEY = 'myInsurance.policies.v1';
const $app = document.getElementById('app');
const $title = document.getElementById('screenTitle');
const $modalRoot = document.getElementById('modalRoot');
const $fab = document.getElementById('fab');

let state = {
  tab: 'policies',
  policies: loadPolicies(),
};

/* ---------- 저장소 (보험 데이터) ---------- */
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

/* ---------- 날짜 / 일정 계산 ---------- */
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
function upcomingEvents(minDays = -30, maxDays = 120) {
  const all = [];
  state.policies.forEach(p => policyEvents(p).forEach(e => all.push(e)));
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

/* === 1) 내 보험 목록 === */
function renderPolicies() {
  const list = state.policies;
  if (!list.length) {
    $app.innerHTML = emptyState('아직 등록된 보험이 없어요', '오른쪽 아래 ＋ 버튼으로 내 보험을 추가해 보세요.');
    return;
  }
  const totalMonthly = list.reduce((s, p) => {
    const m = p.premiumCycle === '연' ? (Number(p.premium) || 0) / 12 : (Number(p.premium) || 0);
    return s + m;
  }, 0);

  const up = upcomingEvents();
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
      `<span class="chip">${CATEGORY_ICON[c.category] || '•'} ${esc(c.name)}</span>`
    ).join('');
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
    <div class="summary">
      <div><strong>${list.length}</strong><span>가입 보험</span></div>
      <div><strong>${won(Math.round(totalMonthly))}</strong><span>월 보험료(합계)</span></div>
    </div>
    ${alertHtml}
    <div class="cards">${cards}</div>
    <p class="disclaimer">※ 실제 보장 여부·금액은 가입한 보험의 약관/증권 및 보험사 안내가 기준입니다. 이 앱은 개인 정리용입니다.</p>
  `;

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

  // 사진 상태 (폼 닫을 때까지 메모리에서만 관리)
  let photoData = editing && p.hasPhoto ? await getPhoto(p.id) : null;
  let photoDirty = false;

  const typeOpts = POLICY_TYPES.map(t => `<option ${p.type === t ? 'selected' : ''}>${t}</option>`).join('');
  const catOpts = (sel) => CATEGORIES.map(c =>
    `<option value="${c.key}" ${sel === c.key ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('');

  function covRow(c = { id: uid(), category: 'diagnosis', name: '', amount: '', note: '' }) {
    return `<div class="cov-row" data-cid="${c.id}">
      <select class="cov-cat">${catOpts(c.category)}</select>
      <input class="cov-name" placeholder="보장명 (예: 암진단비)" value="${esc(c.name)}" />
      <input class="cov-amt" type="number" inputmode="numeric" placeholder="금액(원)" value="${esc(c.amount)}" />
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
        <p class="hint">증권/보장내용 화면을 찍어두면 나중에 확인하기 편해요. 사진에서 글자를 읽어 자동 입력도 시도할 수 있어요.</p>
        <div id="photoArea"></div>
        <input type="file" id="photoInput" accept="image/*" capture="environment" hidden />
      </div>

      <label>보험회사 <input name="insurer" value="${esc(p.insurer)}" placeholder="예: 삼성생명, 현대해상" required /></label>
      <label>상품명 <input name="product" value="${esc(p.product)}" placeholder="예: 든든한 암보험" /></label>
      <div class="grid2">
        <label>종류 <select name="type">${typeOpts}</select></label>
        <label>갱신여부
          <select name="renewal">
            ${['비갱신형','갱신형(1년)','갱신형(3년)','갱신형(5년)','갱신형(10년)','모름'].map(r =>
              `<option ${p.renewal === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </label>
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
      <p class="hint">만기일·갱신일을 넣으면 "다가오는 일정"으로 미리 알려드려요. (갱신주기를 고르면 다음 갱신일은 자동 추정)</p>
      <div class="grid2">
        <label>피보험자 <input name="insured" value="${esc(p.insured)}" placeholder="예: 본인, 자녀" /></label>
        <label>계약자 <input name="contractor" value="${esc(p.contractor)}" placeholder="예: 본인" /></label>
      </div>

      <div class="cov-head">
        <h3>보장 내용</h3>
        <button type="button" class="btn-ghost" id="addCov">＋ 보장 추가</button>
      </div>
      <p class="hint">증권에 적힌 특약(보장)을 하나씩 추가하세요. 잘 모르면 보험사 앱의 "보장내용 조회"로 확인할 수 있어요.</p>
      <div id="covList">${(p.coverages || []).map(covRow).join('')}</div>

      <label>메모 <textarea name="memo" rows="2" placeholder="기억할 점 (예: 콜센터 1588-0000)">${esc(p.memo)}</textarea></label>

      <div class="modal-foot">
        <button type="button" class="btn-ghost" data-close>취소</button>
        <button type="submit" class="btn-primary">저장</button>
      </div>
    </form>
  `);

  /* --- 사진 영역 렌더 --- */
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
    try {
      photoData = await fileToResizedDataUrl(file);
      photoDirty = true;
      drawPhoto();
    } catch (err) { alert('사진을 불러오지 못했어요.'); }
    photoInput.value = '';
  };
  drawPhoto();

  /* --- OCR 실행 --- */
  async function runOcrFlow() {
    const status = $modalRoot.querySelector('#ocrStatus');
    const f = $modalRoot.querySelector('#policyForm');
    status.textContent = '글자 인식 준비 중… (처음엔 시간이 걸려요)';
    try {
      const text = await runOcr(photoData, m => {
        if (m && m.status === 'recognizing text') status.textContent = `인식 중… ${Math.round((m.progress || 0) * 100)}%`;
      });
      const parsed = parseOcr(text);
      let filled = [];
      if (parsed.insurer && !f.insurer.value) { f.insurer.value = parsed.insurer; filled.push('회사명'); }
      if (parsed.product && !f.product.value) { f.product.value = parsed.product; filled.push('상품명'); }
      if (parsed.policyNo && !f.policyNo.value) { f.policyNo.value = parsed.policyNo; filled.push('증권번호'); }
      status.innerHTML = filled.length
        ? `✅ 자동 입력: ${filled.join(', ')} — 값이 맞는지 확인하고 고치세요.`
        : '인식은 됐지만 자동으로 채울 항목을 못 찾았어요. 아래 인식된 글자를 참고해 직접 입력하세요.';
      if (text.trim()) {
        status.innerHTML += `<details class="ocr-text"><summary>인식된 글자 전체 보기</summary><pre>${esc(text)}</pre></details>`;
      }
    } catch (err) {
      status.innerHTML = '⚠️ 글자 인식 기능을 불러오지 못했어요(인터넷 연결이 필요합니다). 직접 입력해 주세요.';
    }
  }

  /* --- 보장 행 --- */
  const covList = $modalRoot.querySelector('#covList');
  $modalRoot.querySelector('#addCov').addEventListener('click', () => {
    covList.insertAdjacentHTML('beforeend', covRow());
    bindCovDel();
    covList.lastElementChild.querySelector('.cov-name').focus();
  });
  function bindCovDel() {
    covList.querySelectorAll('.cov-del').forEach(b => { b.onclick = () => b.closest('.cov-row').remove(); });
  }
  bindCovDel();

  /* --- 저장 --- */
  $modalRoot.querySelector('#policyForm').addEventListener('submit', async e => {
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
      insurer: f.insurer.value.trim(),
      product: f.product.value.trim(),
      type: f.type.value,
      renewal: f.renewal.value,
      premium: f.premium.value,
      premiumCycle: f.premiumCycle.value,
      startDate: f.startDate.value,
      maturityDate: f.maturityDate.value,
      renewalDate: f.renewalDate.value,
      policyNo: f.policyNo.value.trim(),
      insured: f.insured.value.trim(),
      contractor: f.contractor.value.trim(),
      memo: f.memo.value.trim(),
      coverages,
      hasPhoto: !!photoData,
    };

    if (photoDirty) {
      if (photoData) { try { await putPhoto(p.id, photoData); } catch (e2) { alert('사진 저장 공간이 부족할 수 있어요.'); } }
      else await delPhoto(p.id);
    }

    if (editing) {
      const i = state.policies.findIndex(x => x.id === p.id);
      state.policies[i] = updated;
    } else {
      state.policies.push(updated);
    }
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
    img.onerror = rej;
    img.src = url;
  });
}
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = () => res(window.Tesseract);
    s.onerror = rej;
    document.head.appendChild(s);
  });
}
async function runOcr(dataUrl, onProgress) {
  const T = await loadTesseract();
  const { data } = await T.recognize(dataUrl, 'kor+eng', { logger: onProgress });
  return data.text || '';
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
    <p class="disclaimer">※ 입력한 정보만으로 판단한 참고용 분석입니다. 보장 권유·해지 권유가 아니며, 가입·해지는 본인 상황과 약관을 따져 신중히 결정하세요.</p>
  </section>`;
}
function renderCoverage() {
  const byCat = {};
  state.policies.forEach(p => (p.coverages || []).forEach(c => {
    (byCat[c.category] = byCat[c.category] || []).push({ ...c, _p: p });
  }));
  const keys = CATEGORIES.map(c => c.key).filter(k => byCat[k]?.length);
  if (!keys.length) {
    $app.innerHTML = emptyState('아직 보장 정보가 없어요', '"내 보험" 탭에서 보험과 보장을 추가하면 여기에 정리돼요.');
    return;
  }
  const blocks = keys.map(k => {
    const items = byCat[k];
    const total = items.reduce((s, c) => s + (Number(c.amount) || 0), 0);
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
      <ul class="cov-list">${rows}</ul>
    </section>`;
  }).join('');
  $app.innerHTML = renderAnalysis() + `<h3 class="sec-h">🛡️ 카테고리별 보장</h3>` + blocks +
    `<p class="disclaimer">※ "정액 합계"는 진단비·일당처럼 금액이 정해진 보장의 단순 합계입니다. 실손은 실제 비용 기준이라 합산 의미가 다를 수 있어요.</p>`;
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
  $app.querySelectorAll('.sit-card').forEach(b =>
    b.addEventListener('click', () => openSituation(b.dataset.sit)));
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
          <div class="match-head">${esc(r.p.insurer)} · ${esc(r.p.product)}</div>
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
    <h3 class="sec-h">🧾 청구 준비 / 절차</h3>
    <ol class="steps">${sit.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <h3 class="sec-h">⚠️ 놓치기 쉬운 점</h3>
    <ul class="cautions">${sit.cautions.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
    <p class="disclaimer">※ 일반적인 안내입니다. 실제 지급 여부는 약관과 보험사 심사로 결정돼요.</p>
  `);
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
    localStorage.removeItem('notifiedOn');
    checkAndNotify(true);
    alert('알림을 켰어요. 임박한 갱신·만기(7일 이내)가 있으면 앱을 열 때 알려드려요.');
  } else {
    alert('알림 권한이 꺼져 있어요. 폰 설정에서 이 앱(사이트)의 알림을 허용할 수 있어요.');
  }
}

/* ---------- 백업 / 가져오기 / 초기화 ---------- */
function openMenu() {
  const notifState = ('Notification' in window)
    ? (Notification.permission === 'granted' ? '켜짐' : Notification.permission === 'denied' ? '차단됨' : '꺼짐')
    : '미지원';
  openModal(`
    <div class="modal-head"><h2>백업 · 설정</h2><button class="icon-btn" data-close>✕</button></div>
    <div class="menu-list">
      <button class="menu-item" id="notifBtn">🔔 일정 알림 허용 <span class="menu-state">현재: ${notifState}</span></button>
      <button class="menu-item" id="exportBtn">⬇️ 내 보험 데이터 내보내기 (백업)</button>
      <button class="menu-item" id="importBtn">⬆️ 백업 파일 불러오기</button>
      <button class="menu-item danger" id="resetBtn">🗑️ 전체 초기화</button>
    </div>
    <input type="file" id="importFile" accept="application/json" hidden />
    <p class="hint">데이터는 이 기기(브라우저)에만 저장됩니다. 백업 파일에는 보험 정보가 담기며, 증권 사진은 용량이 커서 포함되지 않아요. 가끔 백업을 내보내 두세요.</p>
  `);
  document.getElementById('notifBtn').onclick = enableNotifications;
  document.getElementById('exportBtn').onclick = exportData;
  document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = importData;
  document.getElementById('resetBtn').onclick = () => {
    if (confirm('모든 보험 데이터를 지울까요? 되돌릴 수 없어요.')) {
      state.policies.forEach(p => delPhoto(p.id));
      state.policies = [];
      savePolicies();
      closeModal();
      setTab('policies');
    }
  };
}
function exportData() {
  const blob = new Blob([JSON.stringify(state.policies, null, 2)], { type: 'application/json' });
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
      if (!Array.isArray(data)) throw new Error('형식 오류');
      if (confirm('불러온 데이터로 교체할까요? (현재 데이터는 사라집니다)')) {
        state.policies = data;
        savePolicies();
        closeModal();
        setTab('policies');
      }
    } catch (err) {
      alert('백업 파일을 읽을 수 없어요. 올바른 JSON 파일인지 확인하세요.');
    }
  };
  reader.readAsText(file);
}

/* ---------- 초기화 ---------- */
document.querySelectorAll('.tab').forEach(b =>
  b.addEventListener('click', () => setTab(b.dataset.tab)));
$fab.addEventListener('click', () => openPolicyForm());
document.getElementById('menuBtn').addEventListener('click', openMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

setTab('policies');
checkAndNotify(false);
