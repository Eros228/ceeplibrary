import {
  watchAuth,
  signUp,
  signIn,
  signOutUser,
  authErrorMessage,
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
let currentUid = null;

// ---------- Elementos: autenticação ----------
const authScreen = document.getElementById("authScreen");
const appMain = document.getElementById("appMain");
const authTabs = document.querySelectorAll(".auth-tab");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const loginError = document.getElementById("loginError");
const signupError = document.getElementById("signupError");
const userNameEl = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");

// ---------- Elementos: app ----------
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

let currentCoverData = null;
let viewingLoansBookId = null;

// ============================================================
//  Autenticação
// ============================================================

authTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    authTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const isLogin = tab.dataset.tab === "login";
    loginForm.hidden = !isLogin;
    signupForm.hidden = isLogin;
    loginError.hidden = true;
    signupError.hidden = true;
  });
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const btn = loginForm.querySelector(".auth-submit");
  btn.disabled = true;
  try {
    await signIn(email, password);
    // A troca de tela acontece via watchAuth()
  } catch (err) {
    loginError.textContent = authErrorMessage(err);
    loginError.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  signupError.hidden = true;
  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const btn = signupForm.querySelector(".auth-submit");
  btn.disabled = true;
  try {
    await signUp(email, password, name);
    // A troca de tela acontece via watchAuth()
  } catch (err) {
    signupError.textContent = authErrorMessage(err);
    signupError.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  closeModals();
  await signOutUser();
});

// Reage a login/logout: carrega (ou limpa) a biblioteca do usuário.
watchAuth(async (user) => {
  if (user) {
    currentUid = user.uid;
    authScreen.hidden = true;
    appMain.hidden = false;
    userNameEl.textContent = user.displayName || user.email;

    books = await initStorage(currentUid);
    console.log("[v0] Fonte de dados:", isUsingFirestore() ? "Firestore" : "localStorage");
    render();
  } else {
    currentUid = null;
    books = [];
    searchTerm = "";
    searchInput.value = "";
    appMain.hidden = true;
    authScreen.hidden = false;
    closeModals();
    loginForm.reset();
    signupForm.reset();
    loginError.hidden = true;
    signupError.hidden = true;
  }
});

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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
        <button class="btn-icon" data-action="delete" aria-label="Excluir ${escapeHtml(book.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>
    `;

    card.querySelector('[data-action="lend"]').addEventListener("click", () => openLend(book.id));
    card.querySelector('[data-action="loans"]').addEventListener("click", () => openLoans(book.id));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteBook(book.id));

    grid.appendChild(card);
  });

  emptyState.hidden = filtered.length !== 0;

  const total = books.length;
  legend.textContent = `${total} ${total === 1 ? "título cadastrado" : "títulos cadastrados"} · disp. = disponíveis, empr. = emprestados, total = total de exemplares`;
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

// ---------- Sugestão de capas (Open Library + Google Books) ----------
// Busca em duas fontes em paralelo, remove duplicatas, prioriza títulos
// que começam exatamente como o termo digitado, e descarta silenciosamente
// qualquer sugestão cuja imagem falhe ao carregar.
let coverSearchTimer = null;
let lastCoverQuery = "";
let coverRequestId = 0;

bookNameInput.addEventListener("input", () => {
  const term = bookNameInput.value.trim();
  clearTimeout(coverSearchTimer);
  if (term.length < 2) {
    coverSuggestions.hidden = true;
    coverSuggestions.innerHTML = "";
    lastCoverQuery = "";
    return;
  }
  coverSearchTimer = setTimeout(() => fetchCoverSuggestions(term), 400);
});

async function fetchOpenLibraryCovers(term, signal) {
  try {
    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(term)}&limit=10&fields=title,author_name,cover_i,first_publish_year`;
    const res = await fetch(url, { signal });
    const data = await res.json();
    return (data.docs || [])
      .filter((d) => d.cover_i)
      .slice(0, 8)
      .map((d) => ({
        title: d.title,
        author: d.author_name ? d.author_name[0] : "",
        year: d.first_publish_year || "",
        cover: `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`,
      }));
  } catch (err) {
    console.log("[v0] Falha ao buscar capas na Open Library:", err);
    return [];
  }
}

async function fetchGoogleBooksCovers(term, signal) {
  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent("intitle:" + term)}&maxResults=10`;
    const res = await fetch(url, { signal });
    const data = await res.json();
    return (data.items || [])
      .filter((it) => it.volumeInfo && it.volumeInfo.imageLinks && it.volumeInfo.imageLinks.thumbnail)
      .slice(0, 8)
      .map((it) => {
        const info = it.volumeInfo;
        return {
          title: info.title,
          author: info.authors ? info.authors[0] : "",
          year: info.publishedDate ? info.publishedDate.slice(0, 4) : "",
          cover: info.imageLinks.thumbnail.replace("http://", "https://"),
        };
      });
  } catch (err) {
    console.log("[v0] Falha ao buscar capas no Google Books:", err);
    return [];
  }
}

async function fetchCoverSuggestions(term) {
  if (term === lastCoverQuery) return;
  lastCoverQuery = term;

  const requestId = ++coverRequestId;

  coverSuggestions.hidden = false;
  coverSuggestions.innerHTML = `<p class="cover-sug-hint"><span class="cover-sug-spinner" aria-hidden="true"></span>Buscando capas...</p>`;

  // Aborta as buscas se demorarem mais de 6s, evitando travar em "Buscando capas..."
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  const [openLibraryResult, googleResult] = await Promise.allSettled([
    fetchOpenLibraryCovers(term, controller.signal),
    fetchGoogleBooksCovers(term, controller.signal),
  ]);
  clearTimeout(timeout);

  // Se o usuário já digitou outra coisa enquanto isso corria, ignora este resultado.
  if (requestId !== coverRequestId) return;

  const combined = [
    ...(openLibraryResult.status === "fulfilled" ? openLibraryResult.value : []),
    ...(googleResult.status === "fulfilled" ? googleResult.value : []),
  ];

  // Remove duplicatas (mesmo título + autor)
  const seen = new Set();
  const unique = combined.filter((item) => {
    const key = `${item.title.toLowerCase()}|${(item.author || "").toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Prioriza títulos que começam exatamente como o termo buscado, depois os mais curtos
  const termLower = term.toLowerCase();
  unique.sort((a, b) => {
    const aStarts = a.title.toLowerCase().startsWith(termLower) ? 0 : 1;
    const bStarts = b.title.toLowerCase().startsWith(termLower) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return a.title.length - b.title.length;
  });

  const top = unique.slice(0, 8);

  if (top.length === 0) {
    coverSuggestions.innerHTML = `<p class="cover-sug-hint">Nenhuma capa encontrada. Você pode enviar uma imagem manualmente.</p>`;
    return;
  }

  coverSuggestions.innerHTML = `<p class="cover-sug-hint">Sugestões de capa (clique para usar):</p>`;
  const row = document.createElement("div");
  row.className = "cover-sug-row";

  top.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cover-sug-item";
    btn.title = `${item.title}${item.author ? " — " + item.author : ""}`;
    btn.innerHTML = `
      <img src="${item.cover}" alt="Capa sugerida: ${escapeHtml(item.title)}" loading="lazy" />
      <span class="cover-sug-caption">${escapeHtml(item.title)}${item.year ? ` (${item.year})` : ""}</span>
    `;

    // Se a imagem não carregar, remove essa sugestão em vez de mostrar um ícone quebrado
    btn.querySelector("img").addEventListener("error", () => btn.remove());

    btn.addEventListener("click", () => {
      currentCoverData = item.cover;
      coverPreview.src = item.cover;
      coverPreview.hidden = false;
      coverSuggestions.querySelectorAll(".cover-sug-item").forEach((el) => el.classList.remove("selected"));
      btn.classList.add("selected");
    });
    row.appendChild(btn);
  });

  coverSuggestions.appendChild(row);
}

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUid) return;
  const name = bookNameInput.value.trim();
  const qty = Math.max(1, parseInt(document.getElementById("bookQty").value, 10) || 1);
  if (!name) return;

  books = await storageAddBook(currentUid, books, { name, total: qty, cover: currentCoverData });
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
  if (!currentUid) return;
  const book = books.find((b) => b.id === lendingBookId);
  if (!book) return;

  // Garante o teto de 15 dias mesmo que o campo seja alterado manualmente
  const loanDate = loanDateInput.value;
  let dueDate = dueDateInput.value;
  const maxDue = addDaysIso(loanDate, MAX_LOAN_DAYS);
  if (!dueDate || dueDate > maxDue) dueDate = maxDue;

  books = await storageAddLoan(currentUid, books, lendingBookId, {
    name: document.getElementById("borrowerName").value.trim(),
    turma: document.getElementById("borrowerClass").value.trim(),
    loanDate,
    dueDate,
  });
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
      if (!currentUid) return;
      books = await storageRemoveLoan(currentUid, books, book.id, loan.id);
      renderLoans();
      render();
    });
    loansList.appendChild(li);
  });
}

// ---------- Excluir ----------
async function deleteBook(bookId) {
  if (!currentUid) return;
  const book = books.find((b) => b.id === bookId);
  if (!book) return;
  if (confirm(`Excluir "${book.name}"? Esta ação não pode ser desfeita.`)) {
    books = await storageDeleteBook(currentUid, books, bookId);
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
  [addModal, lendModal, loansModal].forEach((m) => (m.hidden = true));
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
