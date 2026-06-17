/* =========================================================================
 * app.js — 내 보험 한눈에 (PWA)
 *  - 데이터는 브라우저(localStorage)에만 저장됩니다. 서버로 전송되지 않습니다.
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

/* ---------- 저장소 ---------- */
function loadPolicies() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw === null) return structuredCloneSafe(SAMPLE_POLICIES); // 최초 실행: 예시 제공
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}
function savePolicies() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.policies)); }
  catch (e) { alert('저장 공간이 부족하거나 비공개 모드일 수 있어요.'); }
}
function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }

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

/* ---------- 렌더 ---------- */
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

  const cards = list.map(p => {
    const covCount = (p.coverages || []).length;
    const tags = (p.coverages || []).slice(0, 4).map(c =>
      `<span class="chip">${CATEGORY_ICON[c.category] || '•'} ${esc(c.name)}</span>`
    ).join('');
    const more = covCount > 4 ? `<span class="chip chip-more">+${covCount - 4}</span>` : '';
    return `<article class="card ${p._sample ? 'card-sample' : ''}" data-id="${p.id}">
      <div class="card-top">
        <div>
          <div class="card-insurer">${esc(p.insurer || '회사 미입력')}</div>
          <div class="card-product">${esc(p.product || '상품명 미입력')}</div>
        </div>
        <span class="badge">${esc(p.type || '기타')}</span>
      </div>
      <div class="card-meta">
        ${p.renewal ? `<span>🔁 ${esc(p.renewal)}</span>` : ''}
        ${p.premium ? `<span>💳 ${won(p.premium)}/${esc(p.premiumCycle || '월')}</span>` : ''}
        ${p.startDate ? `<span>📅 ${esc(p.startDate)} 개시</span>` : ''}
      </div>
      <div class="chips">${tags || '<span class="chip chip-empty">보장 미입력</span>'}${more}</div>
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
    <div class="cards">${cards}</div>
    <p class="disclaimer">※ 실제 보장 여부·금액은 가입한 보험의 약관/증권 및 보험사 안내가 기준입니다. 이 앱은 개인 정리용입니다.</p>
  `;

  $app.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', e => {
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
  render();
}

/* === 보험 상세 보기 === */
function openPolicyDetail(id) {
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
}

/* === 보험 추가/수정 폼 === */
function openPolicyForm(id) {
  const editing = !!id;
  const p = editing
    ? structuredCloneSafe(state.policies.find(x => x.id === id))
    : { id: uid(), insurer: '', product: '', type: '실손의료보험', policyNo: '',
        insured: '본인', contractor: '본인', startDate: '', renewal: '비갱신형',
        premium: '', premiumCycle: '월', memo: '', coverages: [] };

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
      <label>보험회사 <input name="insurer" value="${esc(p.insurer)}" placeholder="예: 삼성생명, 현대해상" required /></label>
      <label>상품명 <input name="product" value="${esc(p.product)}" placeholder="예: 든든한 암보험" /></label>
      <div class="grid2">
        <label>종류
          <select name="type">${typeOpts}</select>
        </label>
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
        <label>증권번호 <input name="policyNo" value="${esc(p.policyNo)}" placeholder="선택" /></label>
      </div>
      <div class="grid2">
        <label>피보험자 <input name="insured" value="${esc(p.insured)}" placeholder="예: 본인, 자녀" /></label>
        <label>계약자 <input name="contractor" value="${esc(p.contractor)}" placeholder="예: 본인" /></label>
      </div>

      <div class="cov-head">
        <h3>보장 내용</h3>
        <button type="button" class="btn-ghost" id="addCov">＋ 보장 추가</button>
      </div>
      <p class="hint">증권에 적힌 특약(보장)을 하나씩 추가하세요. 잘 모르면 보험사 앱에서 "보장내용 조회"로 확인할 수 있어요.</p>
      <div id="covList">${(p.coverages || []).map(covRow).join('')}</div>

      <label>메모 <textarea name="memo" rows="2" placeholder="기억할 점 (예: 콜센터 1588-0000)">${esc(p.memo)}</textarea></label>

      <div class="modal-foot">
        <button type="button" class="btn-ghost" data-close>취소</button>
        <button type="submit" class="btn-primary">저장</button>
      </div>
    </form>
  `);

  const covList = $modalRoot.querySelector('#covList');
  $modalRoot.querySelector('#addCov').addEventListener('click', () => {
    covList.insertAdjacentHTML('beforeend', covRow());
    bindCovDel();
    covList.lastElementChild.querySelector('.cov-name').focus();
  });
  function bindCovDel() {
    covList.querySelectorAll('.cov-del').forEach(b => {
      b.onclick = () => b.closest('.cov-row').remove();
    });
  }
  bindCovDel();

  $modalRoot.querySelector('#policyForm').addEventListener('submit', e => {
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
      policyNo: f.policyNo.value.trim(),
      insured: f.insured.value.trim(),
      contractor: f.contractor.value.trim(),
      memo: f.memo.value.trim(),
      coverages,
    };

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

/* === 2) 보장 한눈에 보기 (카테고리별 집계) === */
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

  $app.innerHTML = blocks +
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
        <p class="hint">증권을 다시 확인하거나, 보험사 콜센터에 "이 경우 보장되나요?"라고 문의해 보세요. 보장이 있는데 카테고리가 달라서 안 잡혔을 수도 있어요.</p>
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

/* ---------- 백업 / 가져오기 / 초기화 ---------- */
function openMenu() {
  openModal(`
    <div class="modal-head"><h2>백업 · 설정</h2><button class="icon-btn" data-close>✕</button></div>
    <div class="menu-list">
      <button class="menu-item" id="exportBtn">⬇️ 내 보험 데이터 내보내기 (백업)</button>
      <button class="menu-item" id="importBtn">⬆️ 백업 파일 불러오기</button>
      <button class="menu-item danger" id="resetBtn">🗑️ 전체 초기화</button>
    </div>
    <input type="file" id="importFile" accept="application/json" hidden />
    <p class="hint">데이터는 이 기기(브라우저)에만 저장됩니다. 기기를 바꾸거나 앱을 지우면 사라지니, 가끔 백업을 내보내 두세요.</p>
  `);
  document.getElementById('exportBtn').onclick = exportData;
  document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = importData;
  document.getElementById('resetBtn').onclick = () => {
    if (confirm('모든 보험 데이터를 지울까요? 되돌릴 수 없어요.')) {
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
