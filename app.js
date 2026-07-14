const DB_NAME = 'TaskMasterDB';
const DB_VERSION = 1;

let db;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      db = event.target.result;
      if (!db.objectStoreNames.contains('columns')) {
        db.createObjectStore('columns', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cards')) {
        const cardStore = db.createObjectStore('cards', { keyPath: 'id' });
        cardStore.createIndex('columnId', 'columnId', { unique: false });
      }
      if (!db.objectStoreNames.contains('history')) {
        db.createObjectStore('history', { keyPath: 'date' });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      reject('IndexedDB error: ' + event.target.errorCode);
    };
  });
}

const Storage = {
  async get(storeName, id) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async put(storeName, item) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  async getCardsByColumn(columnId) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['cards'], 'readonly');
      const store = transaction.objectStore('cards');
      const index = store.index('columnId');
      const request = index.getAll(columnId);
      request.onsuccess = () => {
        // Sort by order
        const cards = request.result.sort((a, b) => a.order - b.order);
        resolve(cards);
      };
      request.onerror = () => reject(request.error);
    });
  },
  async clearAll() {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['columns', 'cards', 'history'], 'readwrite');
      transaction.objectStore('columns').clear();
      transaction.objectStore('cards').clear();
      transaction.objectStore('history').clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
};

async function initDefaultState() {
  const columns = await Storage.getAll('columns');
  if (columns.length === 0) {
    const defaultColumns = [
      { id: 'col-1', title: 'To Do', order: 0 },
      { id: 'col-2', title: 'Doing', order: 1 },
      { id: 'col-3', title: 'Done', order: 2 }
    ];
    for (const col of defaultColumns) {
      await Storage.put('columns', col);
    }
  }
}

// === UI Rendering ===

async function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  const columns = await Storage.getAll('columns');
  columns.sort((a, b) => a.order - b.order);

  for (const col of columns) {
    const colEl = createColumnElement(col);
    board.appendChild(colEl);
    await renderCards(col.id, colEl.querySelector('.card-list'));
  }
}

function createColumnElement(col) {
  const colDiv = document.createElement('div');
  colDiv.className = 'column';
  colDiv.dataset.id = col.id;

  const header = document.createElement('div');
  header.className = 'column-header';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = col.title;
  titleInput.onblur = async () => {
    col.title = titleInput.value;
    await Storage.put('columns', col);
  };

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-col-btn';
  deleteBtn.innerHTML = '&times;';
  deleteBtn.onclick = async () => {
    if (confirm('Delete this column and all its cards?')) {
      const cards = await Storage.getCardsByColumn(col.id);
      for (const card of cards) {
        await Storage.delete('cards', card.id);
      }
      await Storage.delete('columns', col.id);
      renderBoard();
    }
  };

  header.appendChild(titleInput);
  header.appendChild(deleteBtn);

  const cardList = document.createElement('div');
  cardList.className = 'card-list';
  cardList.dataset.columnId = col.id;

  const addCardBtn = document.createElement('button');
  addCardBtn.className = 'add-card-btn';
  addCardBtn.textContent = '+ Add a card';
  addCardBtn.onclick = async () => {
    const newCard = {
      id: 'card-' + Date.now(),
      columnId: col.id,
      title: 'New Task',
      description: '',
      subtasks: [],
      tags: '',
      dueDate: '',
      effort: '',
      timeLogged: 0,
      order: Date.now()
    };
    await Storage.put('cards', newCard);
    renderBoard();
  };

  colDiv.appendChild(header);
  colDiv.appendChild(cardList);
  colDiv.appendChild(addCardBtn);

  return colDiv;
}

document.getElementById('add-column-btn').onclick = async () => {
  const columns = await Storage.getAll('columns');
  const newCol = {
    id: 'col-' + Date.now(),
    title: 'New Column',
    order: columns.length
  };
  await Storage.put('columns', newCol);
  renderBoard();
};

async function renderCards(columnId, container) {
  container.innerHTML = '';
  const cards = await Storage.getCardsByColumn(columnId);

  for (const card of cards) {
    const cardEl = createCardElement(card);
    container.appendChild(cardEl);
  }
}

function createCardElement(card) {
  const cardDiv = document.createElement('div');
  cardDiv.className = 'card';
  cardDiv.dataset.id = card.id;

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = card.title;

  const meta = document.createElement('div');
  meta.className = 'card-meta';

  // Calculate subtasks
  let subtaskStr = '';
  if (card.subtasks && card.subtasks.length > 0) {
    const completed = card.subtasks.filter(st => st.done).length;
    subtaskStr = `${completed}/${card.subtasks.length}`;
  }

  const metaLeft = document.createElement('span');
  metaLeft.textContent = subtaskStr + (card.tags ? ` • ${card.tags}` : '');

  const metaRight = document.createElement('span');
  metaRight.textContent = card.dueDate || card.effort ? `${card.dueDate} ${card.effort}` : '';

  meta.appendChild(metaLeft);
  meta.appendChild(metaRight);

  cardDiv.appendChild(title);
  cardDiv.appendChild(meta);

  cardDiv.onclick = () => openExpandedCard(card);

  return cardDiv;
}

// === Drag and Drop ===

let boardSortable;
const listSortables = [];

function initDragAndDrop() {
  const board = document.getElementById('board');

  if (boardSortable) boardSortable.destroy();
  listSortables.forEach(s => s.destroy());
  listSortables.length = 0;

  // Columns
  boardSortable = new Sortable(board, {
    animation: 150,
    handle: '.column-header',
    onEnd: async (evt) => {
      const columnEls = Array.from(board.children);
      for (let i = 0; i < columnEls.length; i++) {
        const colId = columnEls[i].dataset.id;
        const col = await Storage.get('columns', colId);
        col.order = i;
        await Storage.put('columns', col);
      }
    }
  });

  // Cards
  const lists = board.querySelectorAll('.card-list');
  lists.forEach(list => {
    const s = new Sortable(list, {
      group: 'shared',
      animation: 150,
      onEnd: async (evt) => {
        const itemEl = evt.item;
        const newColumnId = evt.to.dataset.columnId;
        const cardId = itemEl.dataset.id;

        const card = await Storage.get('cards', cardId);
        card.columnId = newColumnId;
        await Storage.put('cards', card);

        // Update order in new list
        const cardEls = Array.from(evt.to.children);
        for (let i = 0; i < cardEls.length; i++) {
          const cId = cardEls[i].dataset.id;
          const c = await Storage.get('cards', cId);
          c.order = i;
          await Storage.put('cards', c);
        }

        renderBoard(); // re-render to update counts
      }
    });
    listSortables.push(s);
  });
}

// Intercept renderBoard to initialize DnD after render
const originalRenderBoard = renderBoard;
renderBoard = async function() {
  await originalRenderBoard();
  initDragAndDrop();
};

// === 3D Flip Card Expansion ===

let currentExpandedCardId = null;

function openExpandedCard(card) {
  currentExpandedCardId = card.id;
  const overlay = document.getElementById('card-modal-overlay');
  const expandedCard = document.getElementById('expanded-card');

  // Render content
  renderExpandedContent(card, expandedCard);

  // Show modal (triggers CSS 3D flip animation)
  overlay.classList.remove('hidden');
}

function closeExpandedCard() {
  currentExpandedCardId = null;
  const overlay = document.getElementById('card-modal-overlay');
  overlay.classList.add('hidden');
  renderBoard(); // refresh to show updated summaries
}

document.getElementById('card-modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'card-modal-overlay') {
    closeExpandedCard();
  }
});

// === Expanded Card Content Rendering (Markdown & Subtasks) ===

function renderExpandedContent(card, container) {
  container.innerHTML = `
    <div class="expanded-header">
      <input type="text" class="expanded-title" value="${card.title}" onblur="updateCardField('${card.id}', 'title', this.value)">
      <button class="close-modal-btn" onclick="closeExpandedCard()">&times;</button>
    </div>

    <div class="expanded-section">
      <h3>Description</h3>
      <div id="desc-preview" class="markdown-preview" onclick="editDescription()">${card.description ? marked.parse(card.description) : '<em>Add a description...</em>'}</div>
      <textarea id="desc-editor" class="markdown-editor" onblur="saveDescription('${card.id}')">${card.description}</textarea>
    </div>

    <div class="expanded-section">
      <h3>Subtasks</h3>
      <div id="subtasks-container"></div>
      <button class="add-subtask-btn" onclick="addSubtask('${card.id}')">+ Add Subtask</button>
    </div>

    <div class="expanded-section">
      <h3>Details</h3>
      <div class="meta-grid">
        <div class="meta-field">
          <label>Tags</label>
          <input type="text" value="${card.tags || ''}" onblur="updateCardField('${card.id}', 'tags', this.value)" placeholder="e.g. Bug, Feature">
        </div>
        <div class="meta-field">
          <label>Due Date</label>
          <input type="date" value="${card.dueDate || ''}" onblur="updateCardField('${card.id}', 'dueDate', this.value)">
        </div>
        <div class="meta-field">
          <label>Effort Estimate</label>
          <input type="text" value="${card.effort || ''}" onblur="updateCardField('${card.id}', 'effort', this.value)" placeholder="e.g. 2h">
        </div>
        <div class="meta-field">
          <label>Time Logged (mins)</label>
          <input type="number" value="${card.timeLogged || 0}" onblur="updateCardField('${card.id}', 'timeLogged', this.value)">
        </div>
      </div>
    </div>

    <button class="delete-card-btn" onclick="deleteCard('${card.id}')">Delete Card</button>
  `;

  renderSubtasks(card);
}

function editDescription() {
  document.getElementById('desc-preview').style.display = 'none';
  const editor = document.getElementById('desc-editor');
  editor.style.display = 'block';
  editor.focus();
}

async function saveDescription(cardId) {
  const val = document.getElementById('desc-editor').value;
  await updateCardField(cardId, 'description', val);

  document.getElementById('desc-editor').style.display = 'none';
  const preview = document.getElementById('desc-preview');
  preview.innerHTML = val ? marked.parse(val) : '<em>Add a description...</em>';
  preview.style.display = 'block';
}

async function updateCardField(cardId, field, value) {
  const card = await Storage.get('cards', cardId);
  if (field === 'timeLogged') value = Number(value);
  card[field] = value;
  await Storage.put('cards', card);
}

async function renderSubtasks(card) {
  const container = document.getElementById('subtasks-container');
  container.innerHTML = '';

  if (!card.subtasks) card.subtasks = [];

  card.subtasks.forEach((st, index) => {
    const item = document.createElement('div');
    item.className = 'subtask-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = st.done;
    cb.onchange = async () => {
      st.done = cb.checked;
      await Storage.put('cards', card);
    };

    const input = document.createElement('input');
    input.type = 'text';
    input.value = st.title;
    input.onblur = async () => {
      st.title = input.value;
      await Storage.put('cards', card);
    };

    const delBtn = document.createElement('button');
    delBtn.innerHTML = '&times;';
    delBtn.onclick = async () => {
      card.subtasks.splice(index, 1);
      await Storage.put('cards', card);
      renderSubtasks(card);
    };

    item.appendChild(cb);
    item.appendChild(input);
    item.appendChild(delBtn);
    container.appendChild(item);
  });
}

async function addSubtask(cardId) {
  const card = await Storage.get('cards', cardId);
  if (!card.subtasks) card.subtasks = [];
  card.subtasks.push({ title: 'New Subtask', done: false });
  await Storage.put('cards', card);
  renderSubtasks(card);
}

async function deleteCard(cardId) {
  if (confirm('Delete this card?')) {
    await Storage.delete('cards', cardId);
    closeExpandedCard();
  }
}

// === Analytics (Cumulative Flow Diagram) ===

let cfdChart;

async function saveHistorySnapshot() {
  const date = new Date().toISOString().split('T')[0];
  const columns = await Storage.getAll('columns');
  const cards = await Storage.getAll('cards');

  const counts = {};
  columns.forEach(col => counts[col.id] = 0);
  cards.forEach(card => {
    if (counts[card.columnId] !== undefined) {
      counts[card.columnId]++;
    }
  });

  await Storage.put('history', { date, counts });
}

async function renderAnalytics() {
  const modal = document.getElementById('analytics-modal');
  modal.classList.remove('hidden');

  // ensure we have a current snapshot
  await saveHistorySnapshot();

  const history = await Storage.getAll('history');
  const columns = await Storage.getAll('columns');

  history.sort((a, b) => new Date(a.date) - new Date(b.date));

  const labels = history.map(h => h.date);
  const datasets = columns.map((col, i) => {
    // Generate a color based on index
    const hue = (i * 137.508) % 360;
    return {
      label: col.title,
      data: history.map(h => h.counts[col.id] || 0),
      backgroundColor: `hsla(${hue}, 70%, 50%, 0.5)`,
      borderColor: `hsl(${hue}, 70%, 50%)`,
      fill: true
    };
  });

  const ctx = document.getElementById('cfd-chart').getContext('2d');

  if (cfdChart) cfdChart.destroy();

  cfdChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { stacked: true, beginAtZero: true },
        x: { stacked: true }
      },
      plugins: {
        filler: { propagate: false }
      }
    }
  });
}

document.getElementById('show-analytics-btn').onclick = renderAnalytics;
document.getElementById('close-analytics-btn').onclick = () => {
  document.getElementById('analytics-modal').classList.add('hidden');
};

// === Backup & Restore ===

document.getElementById('backup-btn').onclick = async () => {
  const columns = await Storage.getAll('columns');
  const cards = await Storage.getAll('cards');
  const history = await Storage.getAll('history');

  const backup = { columns, cards, history };
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `taskmaster-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();

  URL.revokeObjectURL(url);
};

document.getElementById('restore-btn').onclick = () => {
  document.getElementById('restore-input').click();
};

document.getElementById('restore-input').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      if (data.columns && data.cards) {
        await Storage.clearAll();

        for (const col of data.columns) await Storage.put('columns', col);
        for (const card of data.cards) await Storage.put('cards', card);
        if (data.history) {
          for (const h of data.history) await Storage.put('history', h);
        }

        alert('Restore successful!');
        renderBoard();
      } else {
        alert('Invalid backup file.');
      }
    } catch (err) {
      alert('Error parsing backup file.');
      console.error(err);
    }
  };
  reader.readAsText(file);
};

// === Initialization ===

window.onload = async () => {
  await initDB();
  await initDefaultState();
  await renderBoard();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered', reg))
      .catch(err => console.error('Service Worker registration failed', err));
  }
};
