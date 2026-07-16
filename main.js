import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import './style.css';

const app = document.querySelector('#app');

const items = [
  '최애', '입덕계기', '최애떡밥', '최애릴스', '셀카',
  '투샷', '2차', '관계성', '용훈모에화', '민재모에화'
];

let supabase, board, rows = [];

const state = {
  boardId: new URLSearchParams(location.search).get('board'),
  profile: JSON.parse(localStorage.getItem('taste-profile') || 'null')
};

const escape = (value = '') => {
  const el = document.createElement('div');
  el.textContent = value;
  return el.innerHTML;
};

const ready = () =>
  !SUPABASE_URL.startsWith('YOUR_') &&
  !SUPABASE_ANON_KEY.startsWith('YOUR_');

function renderProfile() {
  app.innerHTML = `
    <main class="onboarding">
      <p class="eyebrow">TASTE ARCHIVE</p>
      <h1>이름을<br>남겨주세요.</h1>
      <p>표에 표시될 닉네임이에요.</p>

      <form id="profile-form">
        <input required autofocus maxlength="20" name="name" placeholder="닉네임 입력">
        <button>취향표 열기 <span>→</span></button>
      </form>
    </main>
  `;

  document.querySelector('#profile-form').onsubmit = (event) => {
    event.preventDefault();

    state.profile = {
      name: new FormData(event.currentTarget).get('name').trim()
    };

    localStorage.setItem('taste-profile', JSON.stringify(state.profile));
    start();
  };
}

async function createBoard() {
  const { data, error } = await supabase
    .from('taste_boards')
    .insert({ title: '묭민취향표🥢', items })
    .select()
    .single();

  if (error) return alert(error.message);

  location.replace(`${location.pathname}?board=${data.id}`);
}

function profileImage(url, name) {
  if (url) {
    return `<img src="${escape(url)}" alt="${escape(name)} 프로필 사진">`;
  }

  return '<span class="plus-icon">+</span>';
}

function renderBoard() {
  const headers = items.map((item) => `<th>${escape(item)}</th>`).join('');

  const body = rows.map((row) => `
    <tr data-id="${row.id}">
      <td class="identity-cell">
        <div class="identity">
          <label class="avatar-upload" title="프로필 사진 추가">
            ${profileImage(row.avatar_url, row.nickname)}
            <input class="avatar-file" type="file" accept="image/*">
          </label>
          <span>${escape(row.nickname)}</span>
        </div>
      </td>

      ${items.map((item, index) => `
        <td>
          <label class="photo-upload" title="${item} 사진 추가">
            ${
              row.values?.[index]?.image_url
                ? `<img src="${escape(row.values[index].image_url)}" alt="${item}">`
                : '<span class="plus-icon">+</span>'
            }
            <input class="photo-file" data-index="${index}" type="file" accept="image/*">
          </label>
        </td>
      `).join('')}
    </tr>
  `).join('');

  app.innerHTML = `
    <header class="site-header">
      <div>
        <p class="eyebrow">TASTE ARCHIVE</p>
        <h1>${escape(board.title)}</h1>
      </div>

      <button id="share" class="share-button">링크 공유 <span>↗</span></button>
    </header>

    <main class="board-page">
      <div class="board-note">
        <span>함께 채우는 최애 기록</span>
        <span>사진 칸의 <b>+</b>를 눌러 업로드하세요.</span>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="identity-head">프로필</th>
              ${headers}
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>

      <button id="add-row" class="add-row"><span>+</span> 내 줄 추가하기</button>
    </main>
  `;

  document.querySelector('#add-row').onclick = addRow;
  document.querySelector('#share').onclick = share;

  document.querySelectorAll('.photo-file, .avatar-file').forEach((input) => {
    input.onchange = saveImage;
  });
}

async function addRow() {
  const { data, error } = await supabase
    .from('taste_rows')
    .insert({
      board_id: board.id,
      nickname: state.profile.name,
      values: items.map(() => ({}))
    })
    .select()
    .single();

  if (error) return alert(error.message);

  rows.push(data);
  renderBoard();
}

async function upload(file, rowId, kind) {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${board.id}/${rowId}-${kind}.${ext}`;

  const { error } = await supabase.storage
    .from('taste-images')
    .upload(path, file, { upsert: true });

  if (error) throw error;

  return supabase.storage.from('taste-images').getPublicUrl(path).data.publicUrl;
}

async function saveImage(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];

  if (!file) return;

  const row = rows.find(
    (entry) => entry.id === input.closest('tr').dataset.id
  );

  try {
    const isAvatar = input.classList.contains('avatar-file');
    const index = Number(input.dataset.index);

    const url = await upload(
      file,
      row.id,
      isAvatar ? 'avatar' : index
    );

    const values = [...(row.values || items.map(() => ({})))];

    if (!isAvatar) {
      values[index] = { image_url: url };
    }

    const { data, error } = await supabase
      .from('taste_rows')
      .update(isAvatar ? { avatar_url: url } : { values })
      .eq('id', row.id)
      .select()
      .single();

    if (error) throw error;

    rows = rows.map((entry) => entry.id === row.id ? data : entry);
    renderBoard();
  } catch (error) {
    alert(`업로드하지 못했어요: ${error.message}`);
  }
}

async function share() {
  try {
    await navigator.clipboard.writeText(location.href);
    alert('공유 링크를 복사했어요.');
  } catch {
    prompt('이 링크를 복사해 공유하세요.', location.href);
  }
}

async function loadBoard() {
  const [{ data: currentBoard, error }, { data: currentRows, error: rowError }] =
    await Promise.all([
      supabase.from('taste_boards').select().eq('id', state.boardId).single(),
      supabase.from('taste_rows').select().eq('board_id', state.boardId).order('created_at')
    ]);

  if (error || rowError || !currentBoard) {
    return alert(error?.message || rowError?.message || '취향표를 찾을 수 없어요.');
  }

  board = currentBoard;
  rows = currentRows;

  renderBoard();
}

async function start() {
  if (!state.profile) return renderProfile();

  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { error } = await supabase.auth.signInAnonymously();

  if (error) return alert(`연결하지 못했어요: ${error.message}`);

  if (!state.boardId) return createBoard();

  await loadBoard();

  supabase
    .channel(`board:${state.boardId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'taste_rows',
        filter: `board_id=eq.${state.boardId}`
      },
      loadBoard
    )
    .subscribe();
}

ready() ? start() : renderProfile();
