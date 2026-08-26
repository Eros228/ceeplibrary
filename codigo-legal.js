
import {
  initStorage,
  isUsingFirestore,
  addBook as storageAddBook,
  deleteBook as storageDeleteBook,
  addLoan as storageAddLoan,
  removeLoan as storageRemoveLoan,
  updateQty as storageUpdateQty,
} from "./storage.js";

const MAX_LOAN_DAYS = 15;

let books = [];
let searchTerm = "";
let lendingBookId = null;

// ---------- Elementos ----------
const grid = document.getElementById("booksGrid");
const emptyState = document.getElementById("emptyState");
const legend = document.getElementById("legend");
const searchInput = document.getElementById("searchInput");

const addModal = document.getElementById("addModal");
const addForm = document.getElementById("addForm");
const coverInput = document.getElementById("coverInput");
const coverPreview = document.getElementById("coverPreview");

const lendModal = document.getElementById("lendModal");
const lendForm = document.getElementById("lendForm");
const lendBookName = document.getElementById("lendBookName");
const loanDateInput = document.getElementById("loanDate");
const dueDateInput = document.getElementById("dueDate");

const bookNameInput = document.getElementById("bookName");
const coverSuggestions = document.getElementById("coverSuggestions");

const loansModal = document.getElementById("loansModal");
const loansList = document.getElementById("loansList");
const loansSubtitle = document.getElementById("loansSubtitle");

const editQtyModal = document.getElementById("editQtyModal");
const editQtyForm = document.getElementById("editQtyForm");
const editQtyBookName = document.getElementById("editQtyBookName");
const editQtyInput = document.getElementById("editQtyInput");
const editQtyHint = document.getElementById("editQtyHint");

let currentCoverData = null;
let viewingLoansBookId = null;
let editingQtyBookId = null;

// ---------- Utilidades ----------
function available(book) {
  return book.total - book.loans.length;
}

function formatDate(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Retorna a data ISO (yyyy-mm-dd) somando "days" dias a uma data ISO.
function addDaysIso(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------- Renderização ----------
function render() {
  const term = searchTerm.trim().toLowerCase();
  const filtered = books.filter((b) => b.name.toLowerCase().includes(term));

  grid.innerHTML = "";

  filtered.forEach((book) => {
    const disp = available(book);
    const empr = book.loans.length;

    const card = document.createElement("article");
    card.className = "book-card";
    card.innerHTML = `
      <div class="card-cover">
        <input type="checkbox" class="card-checkbox" aria-label="Selecionar ${escapeHtml(book.name)}" />
        <span class="avail-badge ${disp === 0 ? "zero" : ""}">${disp} disp.</span>
        <svg class="cover-fallback" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="52" height="52" aria-hidden="true" ${book.cover ? 'style="display:none"' : ""}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        ${
          book.cover
            ? `<img src="${escapeHtml(book.cover)}" alt="Capa de ${escapeHtml(book.name)}" class="cover-img" referrerpolicy="no-referrer" onerror="this.style.display='none'; const f=this.parentElement.querySelector('.cover-fallback'); if(f) f.style.display='block';" />`
            : ""
        }
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(book.name)}</h3>
        <div class="card-stats">
          <span><b>${disp}</b> disp.</span><span class="sep">|</span>
          <span><b>${empr}</b> empr.</span><span class="sep">|</span>
          <span><b>${book.total}</b> total</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-action" data-action="lend" ${disp === 0 ? "disabled" : ""}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          Emprestar
        </button>
        <button class="btn-action" data-action="loans">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>
          Empréstimos ${empr > 0 ? `<span class="count">${empr}</span>` : ""}
        </button>
        <button class="btn-icon" data-action="editQty" aria-label="Alterar quantidade máxima de ${escapeHtml(book.name)}" title="Alterar quantidade máxima">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
        <button class="btn-icon" data-action="delete" aria-label="Excluir ${escapeHtml(book.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>
    `;

    card.querySelector('[data-action="lend"]').addEventListener("click", () => openLend(book.id));
    card.querySelector('[data-action="loans"]').addEventListener("click", () => openLoans(book.id));
    card.querySelector('[data-action="editQty"]').addEventListener("click", () => openEditQty(book.id));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteBook(book.id));

    grid.appendChild(card);
  });

  emptyState.hidden = filtered.length !== 0;

  const total = books.length;
  legend.textContent = `${total} ${total === 1 ? "título cadastrado" : "títulos cadastrados"} · disp. = disponíveis, empr. = emprestados, total = total de exemplares`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Adicionar livro ----------
document.getElementById("openAddBtn").addEventListener("click", () => openModal(addModal));

coverInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    currentCoverData = reader.result;
    coverPreview.src = currentCoverData;
    coverPreview.hidden = false;
  };
  reader.readAsDataURL(file);
});

// Recomenda capas conforme o usuário digita o nome do livro (Open Library)
let coverSearchTimer = null;
let lastCoverQuery = "";

bookNameInput.addEventListener("input", () => {
  const term = bookNameInput.value.trim();
  clearTimeout(coverSearchTimer);
  if (term.length < 3) {
    coverSuggestions.hidden = true;
    coverSuggestions.innerHTML = "";
    return;
  }
  coverSearchTimer = setTimeout(() => fetchCoverSuggestions(term), 500);
});

async function fetchCoverSuggestions(term) {
  if (term === lastCoverQuery) return;
  lastCoverQuery = term;

  coverSuggestions.hidden = false;
  coverSuggestions.innerHTML = `<p class="cover-sug-hint">Buscando capas...</p>`;

  try {
    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(term)}&limit=8&fields=title,author_name,cover_i`;
    // Aborta a busca se demorar mais de 6s, evitando travar em "Buscando capas..."
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();

    const withCover = (data.docs || []).filter((d) => d.cover_i).slice(0, 6);

    if (withCover.length === 0) {
      coverSuggestions.innerHTML = `<p class="cover-sug-hint">Nenhuma capa encontrada. Você pode enviar uma imagem manualmente.</p>`;
      return;
    }

    coverSuggestions.innerHTML = `<p class="cover-sug-hint">Sugestões de capa (clique para usar):</p>`;
    const row = document.createElement("div");
    row.className = "cover-sug-row";

    withCover.forEach((doc) => {
      const src = `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cover-sug-item";
      btn.title = `${doc.title}${doc.author_name ? " — " + doc.author_name[0] : ""}`;
      btn.innerHTML = `<img src="${src}" alt="Capa sugerida: ${escapeHtml(doc.title)}" loading="lazy" />`;
      btn.addEventListener("click", () => {
        currentCoverData = src;
        coverPreview.src = src;
        coverPreview.hidden = false;
        coverSuggestions.querySelectorAll(".cover-sug-item").forEach((el) => el.classList.remove("selected"));
        btn.classList.add("selected");
      });
      row.appendChild(btn);
    });

    coverSuggestions.appendChild(row);
  } catch (err) {
    console.log("[v0] Falha ao buscar capas na Open Library:", err);
    coverSuggestions.innerHTML = `<p class="cover-sug-hint">Não foi possível buscar capas agora.</p>`;
  }
}

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = bookNameInput.value.trim();
  const qty = Math.max(1, parseInt(document.getElementById("bookQty").value, 10) || 1);
  if (!name) return;

  books = await storageAddBook(books, { name, total: qty, cover: currentCoverData });
  render();
  closeModals();
});

// ---------- Emprestar livro ----------
function openLend(bookId) {
  const book = books.find((b) => b.id === bookId);
  if (!book || available(book) === 0) return;
  lendingBookId = bookId;
  lendBookName.textContent = book.name;
  lendForm.reset();

  const today = new Date().toISOString().slice(0, 10);
  loanDateInput.value = today;

  // Pré-seleciona a devolução em 15 dias e limita o máximo a 15 dias
  const maxDue = addDaysIso(today, MAX_LOAN_DAYS);
  dueDateInput.value = maxDue;   // valor sugerido
  dueDateInput.min = today;      // não pode ser antes do empréstimo
  dueDateInput.max = maxDue;     // no máximo 15 dias

  openModal(lendModal);
}

// Quando a data do empréstimo muda, recalcula o limite de 15 dias
loanDateInput.addEventListener("change", () => {
  const base = loanDateInput.value || new Date().toISOString().slice(0, 10);
  const maxDue = addDaysIso(base, MAX_LOAN_DAYS);
  dueDateInput.min = base;
  dueDateInput.max = maxDue;
  if (!dueDateInput.value || dueDateInput.value > maxDue || dueDateInput.value < base) {
    dueDateInput.value = maxDue;
  }
});

lendForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const book = books.find((b) => b.id === lendingBookId);
  if (!book) return;

  // Garante o teto de 15 dias mesmo que o campo seja alterado manualmente
  const loanDate = loanDateInput.value;
  let dueDate = dueDateInput.value;
  const maxDue = addDaysIso(loanDate, MAX_LOAN_DAYS);
  if (!dueDate || dueDate > maxDue) dueDate = maxDue;

  books = await storageAddLoan(books, lendingBookId, {
    name: document.getElementById("borrowerName").value.trim(),
    turma: document.getElementById("borrowerClass").value.trim(),
    loanDate,
    dueDate,
  });
  render();
  closeModals();
});

// ---------- Alterar quantidade máxima ----------
function openEditQty(bookId) {
  const book = books.find((b) => b.id === bookId);
  if (!book) return;
  editingQtyBookId = bookId;
  editQtyBookName.textContent = book.name;
  editQtyInput.value = book.total;
  editQtyInput.min = book.loans.length > 0 ? book.loans.length : 1;
  editQtyHint.textContent =
    book.loans.length > 0
      ? `Não pode ser menor que ${book.loans.length} (empréstimos ativos no momento).`
      : "Quantidade total de exemplares deste livro.";
  openModal(editQtyModal);
  editQtyInput.focus();
}

editQtyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const book = books.find((b) => b.id === editingQtyBookId);
  if (!book) return;

  const min = book.loans.length > 0 ? book.loans.length : 1;
  let newTotal = parseInt(editQtyInput.value, 10);
  if (!Number.isFinite(newTotal) || newTotal < min) newTotal = min;

  books = await storageUpdateQty(books, editingQtyBookId, newTotal);
  render();
  closeModals();
});

// ---------- Lista de empréstimos ----------
function openLoans(bookId) {
  const book = books.find((b) => b.id === bookId);
  if (!book) return;
  viewingLoansBookId = bookId;
  renderLoans();
  openModal(loansModal);
}

function renderLoans() {
  const book = books.find((b) => b.id === viewingLoansBookId);
  if (!book) return;

  loansSubtitle.textContent = `${book.name} — ${book.loans.length} empréstimo(s) ativo(s).`;
  loansList.innerHTML = "";

  if (book.loans.length === 0) {
    loansList.innerHTML = `<li class="loans-empty">Nenhum empréstimo ativo.</li>`;
    return;
  }

  book.loans.forEach((loan) => {
    const li = document.createElement("li");
    li.className = "loan-item";
    li.innerHTML = `
      <div class="loan-info">
        <strong>${escapeHtml(loan.name || "Sem nome")}</strong>
        <small>${loan.turma ? escapeHtml(loan.turma) + " · " : ""}Emprestado em ${formatDate(loan.loanDate)}${loan.dueDate ? " · devolver até " + formatDate(loan.dueDate) : ""}</small>
      </div>
      <button class="loan-return" type="button">Devolver</button>
    `;
    li.querySelector(".loan-return").addEventListener("click", async () => {
      books = await storageRemoveLoan(books, book.id, loan.id);
      renderLoans();
      render();
    });
    loansList.appendChild(li);
  });
}

// ---------- Excluir ----------
async function deleteBook(bookId) {
  const book = books.find((b) => b.id === bookId);
  if (!book) return;
  if (confirm(`Excluir "${book.name}"? Esta ação não pode ser desfeita.`)) {
    books = await storageDeleteBook(books, bookId);
    render();
  }
}

// ---------- Busca ----------
searchInput.addEventListener("input", (e) => {
  searchTerm = e.target.value;
  render();
});

// ---------- Modais (helpers) ----------
function openModal(modal) {
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModals() {
  [addModal, lendModal, loansModal, editQtyModal].forEach((m) => (m.hidden = true));
  document.body.style.overflow = "";
  // reset estado do formulário de adicionar
  addForm.reset();
  currentCoverData = null;
  coverPreview.hidden = true;
  coverPreview.src = "";
  coverSuggestions.hidden = true;
  coverSuggestions.innerHTML = "";
  lastCoverQuery = "";
}

document.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModals));

document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModals();
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModals();
});

// ---------- Inicialização ----------
async function init() {
  books = await initStorage();
  console.log("[v0] Fonte de dados:", isUsingFirestore() ? "Firestore" : "localStorage");
  render();
}

init();