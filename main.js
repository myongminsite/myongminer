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

let supabase;
let currentUser;
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

function renderSetup() {
  app.innerHTML = `
    <main class="onboarding">
      <h1>Supabase 연결 정보가 필요해요.</h1>
      <p>config.js에 URL과 Publishable key를 입력해 주세요.</p>
    </main>
  `;
}

function profileMarkup(row, canEdit) {
  const image = row.avatar_url
    ? `<img src="${escape(row.avatar_url)}" alt="${escape(row.nickname)} 프로필 사진">`
    : `<span class="${canEdit ? 'plus-icon' : 'locked-dot'}">${canEdit ? '+' : '—'}</span>`;

  if (!canEdit) {
    return `<div class="avatar-upload read-only">${image}</div>`;
  }

  return `
    <label class="avatar-upload" title="프로필 사진 추가">
      ${image}
      <input class="avatar-file" type="file" accept="image/*">
    </label>
  `;
}

function photoMarkup(row, item, index, canEdit) {
  const image = row.values?.[index]?.image_url
    ? `<img src="${escape(row.values[index].image_url)}" alt="${escape(item)}">`
    : `<span class="${canEdit ? 'plus-icon' : 'locked-dot'}">${canEdit ? '+' : '—'}</span>`;

  if (!canEdit) {
    return `<div class="photo-upload read-only">${image}</div>`;
  }

  return `
    <label class="photo-upload" title="${escape(item)} 사진 추가">
      ${image}
      <input
        class="photo-file"
        data-index="${index}"
        type="file"
        accept="image/*"
      >
    </label>
  `;
}

function renderBoard() {
  const headers = items.map((item) => `<th>${escape(item)}</th>`).join('');

  const body = rows
    .map((row) => {
      const canEdit = row.owner_id === currentUser.id;

      return `
        <tr data-id="${row.id}">
          <td class="identity-cell">
            <div class="identity">
              ${profileMarkup(row, canEdit)}

              ${
                canEdit
                  ? `
                    <input
                      class="nickname-input"
                      data-id="${row.id}"
                      value="${escape(row.nickname || '')}"
                      maxlength="20"
                      placeholder="닉네임"
                    >
                    <button class="delete-row" data-id="${row.id}">
                      삭제
                    </button>
                  `
                  : `
                    <span class="nickname-text">
                      ${escape(row.nickname || '닉네임')}
                    </span>
                  `
              }
            </div>
          </td>

          ${items
            .map(
              (item, index) => `
                <td>
                  ${photoMarkup(row, item, index, canEdit)}
                </td>
              `
            )
            .join('')}
        </tr>
      `;
    })
    .join('');

  app.innerHTML = `
    <header class="site-header">
      <div>
        <p class="eyebrow">TASTE ARCHIVE</p>
        <h1>${escape(board.title)}</h1>
      </div>
    </header>

    <main class="board-page">
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

      <button id="add-row" class="add-row">
        <span>+</span> 추가하기
      </button>
    </main>
  `;

  document.querySelector('#add-row').onclick = addRow;

  document.querySelectorAll('.photo-file, .avatar-file').forEach((input) => {
    input.onchange = saveImage;
  });

  document.querySelectorAll('.nickname-input').forEach((input) => {
    input.onchange = saveNickname;
  });

  document.querySelectorAll('.delete-row').forEach((button) => {
    button.onclick = deleteRow;
  });
}

async function addRow() {
  const { data, error } = await supabase
    .from('taste_rows')
    .insert({
      board_id: board.id,
      owner_id: currentUser.id,
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

async function deleteRow(event) {
  const rowId = event.currentTarget.dataset.id;

  if (!confirm('이 줄을 삭제할까요?')) {
    return;
  }

  const { error } = await supabase
    .from('taste_rows')
    .delete()
    .eq('id', rowId);

  if (error) {
    alert(`삭제하지 못했어요: ${error.message}`);
    return;
  }

  rows = rows.filter((row) => row.id !== rowId);
  renderBoard();
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

async function loadBoard() {
  const { data: currentBoard, error: boardError } = await supabase
    .from('taste_boards')
    .select()
    .limit(1)
    .maybeSingle();

  if (boardError || !currentBoard) {
    alert(boardError?.message || '취향표를 찾을 수 없어요.');
    return;
  }

  board = currentBoard;

  const { data: currentRows, error: rowError } = await supabase
    .from('taste_rows')
    .select()
    .eq('board_id', board.id)
    .order('created_at');

  if (rowError) {
    alert(rowError.message);
    return;
  }

  rows = currentRows;
  renderBoard();
}

async function start() {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (session?.user) {
    currentUser = session.user;
  } else {
    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      alert(`연결하지 못했어요: ${error.message}`);
      return;
    }

    currentUser = data.user;
  }

  await loadBoard();

  supabase
    .channel('taste-rows')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'taste_rows'
      },
      loadBoard
    )
    .subscribe();
}

ready() ? start() : renderSetup();
