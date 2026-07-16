import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import './style.css';

const app = document.querySelector('#app');
const blankItems = Array.from({ length: 11 }, (_, i) => `목록 ${i + 1}`);
let supabase, board, rows = [];
const state = { boardId: new URLSearchParams(location.search).get('board'), profile: JSON.parse(localStorage.getItem('taste-profile') || 'null') };

function escape(text = '') { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function initials(name = '') { return name.trim().slice(0, 1) || '?'; }
function ready() { return !SUPABASE_URL.startsWith('YOUR_') && !SUPABASE_ANON_KEY.startsWith('YOUR_'); }

function renderSetup() {
  app.innerHTML = `<main class="mx-auto max-w-xl px-5 py-20"><p class="text-sm font-semibold text-violet-600">GROUP TASTE TABLE</p><h1 class="mt-2 text-4xl font-bold">우리의 취향표</h1><p class="mt-4 leading-7 text-stone-600">Supabase 연결 정보가 아직 없습니다. <code>src/config.js</code>에 프로젝트 URL과 anon key를 입력한 뒤 새로고침해 주세요.</p></main>`;
}
function renderProfile() {
  app.innerHTML = `<main class="mx-auto max-w-md px-5 py-20"><p class="text-sm font-semibold text-violet-600">WELCOME</p><h1 class="mt-2 text-3xl font-bold">표에 표시할 이름을 알려주세요</h1><form id="profile-form" class="mt-8 space-y-4"><input required name="name" maxlength="30" placeholder="닉네임" class="w-full rounded-xl border border-stone-300 px-4 py-3 outline-violet-500"><input name="avatar" type="url" placeholder="프로필 사진 URL (선택)" class="w-full rounded-xl border border-stone-300 px-4 py-3 outline-violet-500"><button class="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white">시작하기</button></form></main>`;
  document.querySelector('#profile-form').onsubmit = e => { e.preventDefault(); state.profile = Object.fromEntries(new FormData(e.target)); localStorage.setItem('taste-profile', JSON.stringify(state.profile)); start(); };
}
function renderHome() {
  app.innerHTML = `<main class="mx-auto max-w-xl px-5 py-20"><p class="text-sm font-semibold text-violet-600">${escape(state.profile.name)}님의 공간</p><h1 class="mt-2 text-4xl font-bold">새 취향표를 만들어요</h1><p class="mt-4 text-stone-600">만든 뒤 링크를 공유하면 친구들도 같은 표에 한 줄씩 추가할 수 있어요.</p><button id="create" class="mt-8 rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white">새 취향표 만들기</button></main>`;
  document.querySelector('#create').onclick = createBoard;
}
async function createBoard() {
  const title = prompt('취향표 제목을 입력해 주세요.', '우리의 취향표'); if (!title) return;
  const { data, error } = await supabase.from('taste_boards').insert({ title, items: blankItems }).select().single();
  if (error) return alert(error.message); location.href = `${location.pathname}?board=${data.id}`;
}
function avatar(row) { return row.avatar_url ? `<img class="avatar" src="${escape(row.avatar_url)}" alt="">` : `<span class="avatar avatar-letter">${escape(initials(row.nickname))}</span>`; }
function renderBoard() {
  const headers = board.items.map((item, i) => `<th><input class="header-input" data-index="${i}" value="${escape(item)}" aria-label="목록 ${i + 1} 제목"></th>`).join('');
  const body = rows.map(row => `<tr data-id="${row.id}"><td class="sticky left-0 z-10 bg-white"><div class="flex min-w-40 items-center gap-2">${avatar(row)}<input class="nick" value="${escape(row.nickname)}"></div></td>${board.items.map((_, i) => `<td><label class="image-cell">${row.values?.[i]?.image_url ? `<img src="${escape(row.values[i].image_url)}" alt="">` : '<span>사진 추가</span>'}<input class="photo" data-index="${i}" type="file" accept="image/*"></label></td>`).join('')}</tr>`).join('');
  app.innerHTML = `<header class="border-b bg-white"><div class="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-5 py-4"><div><p class="text-xs font-bold text-violet-600">GROUP TASTE TABLE</p><h1 class="text-xl font-bold">${escape(board.title)}</h1></div><div class="flex gap-2"><button id="share" class="button-secondary">링크 공유</button><button id="save" class="button-primary">저장</button></div></div></header><main class="mx-auto max-w-[1800px] p-5"><p class="mb-4 text-sm text-stone-500">사진 칸을 눌러 각 목록의 사진을 올리고, 행을 추가해 주세요.</p><div class="table-wrap"><table><thead><tr><th class="sticky left-0 z-20 bg-stone-100">프로필 · 닉네임</th>${headers}</tr></thead><tbody>${body}</tbody></table></div><button id="add-row" class="mt-4 button-secondary">+ 내 행 추가</button></main>`;
  document.querySelector('#add-row').onclick = addRow;
  document.querySelector('#save').onclick = save;
  document.querySelector('#share').onclick = async () => { await navigator.clipboard.writeText(location.href); alert('공유 링크를 복사했어요.'); };
}
async function addRow() {
  const { data, error } = await supabase.from('taste_rows').insert({ board_id: board.id, nickname: state.profile.name, avatar_url: state.profile.avatar || null, values: blankItems.map(() => ({})) }).select().single();
  if (error) return alert(error.message); rows.push(data); renderBoard();
}
async function upload(file, boardId, rowId, index) {
  const ext = file.name.split('.').pop(); const path = `${boardId}/${rowId}-${index}.${ext}`;
  const { error } = await supabase.storage.from('taste-images').upload(path, file, { upsert: true }); if (error) throw error;
  return supabase.storage.from('taste-images').getPublicUrl(path).data.publicUrl;
}
async function save() {
  const headers = [...document.querySelectorAll('.header-input')].map(input => input.value.trim() || '이름 없음');
  const saves = [...document.querySelectorAll('tbody tr')].map(async tr => {
    const row = rows.find(r => r.id === tr.dataset.id); const values = [...(row.values || blankItems.map(() => ({})))];
    for (const input of tr.querySelectorAll('.photo')) if (input.files[0]) values[input.dataset.index] = { image_url: await upload(input.files[0], board.id, row.id, input.dataset.index) };
    return supabase.from('taste_rows').update({ nickname: tr.querySelector('.nick').value.trim() || '익명', values }).eq('id', row.id);
  });
  const results = await Promise.all([...saves, supabase.from('taste_boards').update({ items: headers }).eq('id', board.id)]);
  const error = results.find(r => r.error)?.error; if (error) return alert(error.message); await loadBoard(); alert('저장했어요.');
}
async function loadBoard() {
  const [{ data: currentBoard, error }, { data: currentRows, error: rowsError }] = await Promise.all([supabase.from('taste_boards').select().eq('id', state.boardId).single(), supabase.from('taste_rows').select().eq('board_id', state.boardId).order('created_at')]);
  if (error || rowsError || !currentBoard) return alert(error?.message || rowsError?.message || '표를 찾을 수 없어요.'); board = currentBoard; rows = currentRows; renderBoard();
}
async function start() {
  if (!state.profile) return renderProfile();
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await supabase.auth.signInAnonymously(); if (error) return alert(`익명 로그인 실패: ${error.message}`);
  if (!state.boardId) return renderHome(); await loadBoard();
  supabase.channel(`board:${state.boardId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'taste_rows', filter: `board_id=eq.${state.boardId}` }, loadBoard)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'taste_boards', filter: `id=eq.${state.boardId}` }, loadBoard)
    .subscribe();
}
ready() ? start() : renderSetup();
