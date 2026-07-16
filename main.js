import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import './style.css';

const app = document.querySelector('#app');

const items = [
  '최애',
  '입덕계기',
  '최애떡밥',
  '최애릴스',
  '셀카',
  '투샷',
  '2차',
  '관계성',
  '용훈모에화',
  '민재모에화'
];

const state = {
  boardId: 'f03b933e-ce8d-46f8-a0bd-8c78717d7a33'
};

let supabase;
let board;
let rows = [];

function escape(value = '') {
  const el = document.createElement('div');
  el.textContent = value;
  return el.innerHTML;
}

function ready() {
  return (
    !SUPABASE_URL.startsWith('YOUR_') &&
    !SUPABASE_ANON_KEY.startsWith('YOUR_')
  );
}

function profileImage(url, name) {
  if (url) {
    return `<img src="${escape(url)}" alt="${escape(name)} 프로필 사진">`;
  }

  return '<span class="plus-icon">+</span>';
}

function renderSetup() {
  app.innerHTML = `
    <main class="onboarding">
      <h1>Supabase 연결 정보가 필요해요.</h1>
      <p>config.js에 URL과 Publishable key를 입력해 주세요.</p>
    </main>
  `;
}

function renderBoard() {
  const headers = items
    .map((item) => `<th>${escape(item)}</th>`)
    .join('');

  const body = rows
    .map(
      (row) => `
        <tr data-id="${row.id}">
          <td class="identity-cell">
            <div class="identity">
              <label class="avatar-upload" title="프로필 사진 추가">
                ${profileImage(row.avatar_url, row.nickname)}
                <input class="avatar-file" type="file" accept="image/*">
              </label>

              <input
                class="nickname-input"
                data-id="${row.id}"
                value="${escape(row.nickname || '')}"
                maxlength="20"
                placeholder="닉네임"
              >
            </div>
          </td>

          ${items
            .map(
              (item, index) => `
                <td>
                  <label class="photo-upload" title="${item} 사진 추가">
                    ${
                      row.values?.[index]?.image_url
                        ? `<img src="${escape(
                            row.values[index].image_url
                          )}" alt="${escape(item)}">`
                        : '<span class="plus-icon">+</span>'
                    }

                    <input
                      class="photo-file"
                      data-index="${index}"
                      type="file"
                      accept="image/*"
                    >
                  </label>
                </td>
              `
            )
            .join('')}
        </tr>
      `
    )
    .join('');

  app.innerHTML = `
    <header class="site-header">
      <div>
        <p class="eyebrow">TASTE ARCHIVE</p>
        <h1>${escape(board.title)}</h1>
      </div>

      <button id="share" class="share-button">링크 공유</button>
    </header>

    <main class="board-page">
      <div class="board-note">
        <span>묭민취향표 🥢</span>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="identity-head">프로필</th>
              ${headers}
            </tr>
          </thead>

          <tbody>
            ${body}
          </tbody>
        </table>
      </div>

      <button id="add-row" class="add-row">
        <span>+</span> 추가하기
      </button>
    </main>
  `;

  document.querySelector('#add-row').onclick = addRow;
  document.querySelector('#share').onclick = share;

  document
    .querySelectorAll('.photo-file, .avatar-file')
    .forEach((input) => {
      input.onchange = saveImage;
    });

  document.querySelectorAll('.nickname-input').forEach((input) => {
    input.onchange = saveNickname;
  });
}

async function addRow() {
  const { data, error } = await supabase
    .from('taste_rows')
    .insert({
      board_id: board.id,
      nickname: '',
      values: items.map(() => ({}))
    })
    .select()
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  rows.push(data);
  renderBoard();
}

async function saveNickname(event) {
  const input = event.currentTarget;
  const nickname = input.value.trim() || '닉네임';

  const { error } = await supabase
    .from('taste_rows')
    .update({ nickname })
    .eq('id', input.dataset.id);

  if (error) {
    alert(`닉네임을 저장하지 못했어요: ${error.message}`);
  }
}

async function upload(file, rowId, kind) {
  const extension = file.name.split('.').pop() || 'jpg';
  const path = `${board.id}/${rowId}-${kind}.${extension}`;

  const { error } = await supabase.storage
    .from('taste-images')
    .upload(path, file, { upsert: true });

  if (error) {
    throw error;
  }

  return supabase.storage
    .from('taste-images')
    .getPublicUrl(path).data.publicUrl;
}

async function saveImage(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  const rowId = input.closest('tr').dataset.id;
  const row = rows.find((entry) => entry.id === rowId);

  try {
    const isAvatar = input.classList.contains('avatar-file');
    const index = Number(input.dataset.index);

    const imageUrl = await upload(
      file,
      row.id,
      isAvatar ? 'avatar' : index
    );

    const values = [...(row.values || items.map(() => ({})))];

    if (!isAvatar) {
      values[index] = { image_url: imageUrl };
    }

    const { data, error } = await supabase
      .from('taste_rows')
      .update(isAvatar ? { avatar_url: imageUrl } : { values })
      .eq('id', row.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    rows = rows.map((entry) => (entry.id === row.id ? data : entry));
    renderBoard();
  } catch (error) {
    alert(`업로드하지 못했어요: ${error.message}`);
  }
}

async function share() {
  try {
    await navigator.clipboard.writeText(location.origin);
    alert('사이트 링크를 복사했어요.');
  } catch {
    prompt('이 링크를 복사해 공유하세요.', location.origin);
  }
}

async function loadBoard() {
  const [
    { data: currentBoard, error: boardError },
    { data: currentRows, error: rowError }
  ] = await Promise.all([
    supabase
      .from('taste_boards')
      .select()
      .eq('id', state.boardId)
      .single(),

    supabase
      .from('taste_rows')
      .select()
      .eq('board_id', state.boardId)
      .order('created_at')
  ]);

  if (boardError || rowError || !currentBoard) {
    alert(
      boardError?.message ||
        rowError?.message ||
        '취향표를 찾을 수 없어요.'
    );
    return;
  }

  board = currentBoard;
  rows = currentRows;

  renderBoard();
}

async function start() {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

ready() ? start() : renderSetup();
