import {
  watchAuth,
  signUp,
  signIn,
  signOutUser,
  resetPassword,
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
let currentView = "all"; // "all" | "loans" | "manual"

// ============================================================
//  Elementos: autenticação
// ============================================================
const authScreen = document.getElementById("authScreen");
const appMain = document.getElementById("appMain");
const authTabButtons = document.querySelectorAll("#authScreen .auth-tab");

const loginForm = document.getElementById("loginForm");
const loginEmailInput = document.getElementById("loginEmail");
const loginPasswordInput = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");

const signupForm = document.getElementById("signupForm");
const signupNameInput = document.getElementById("signupName");
const signupEmailInput = document.getElementById("signupEmail");
const signupPasswordInput = document.getElementById("signupPassword");
const signupError = document.getElementById("signupError");

const resetForm = document.getElementById("resetForm");
const resetEmailInput = document.getElementById("resetEmail");
const resetMessage = document.getElementById("resetMessage");
const resetError = document.getElementById("resetError");

const authForms = { login: loginForm, signup: signupForm, reset: resetForm };

const userNameEl = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");

// ============================================================
//  Elementos: app
// ============================================================
const navViewButtons = document.querySelectorAll(".nav-view");
const grid = document.getElementById("booksGrid");
const emptyState = document.getElementById("emptyState");
const manualSection = document.getElementById("manualSection");
const legend = document.getElementById("legend");
const searchInput = document.getElementById("searchInput");

const addModal = document.getElementById("addModal");
const addForm = document.getElementById("addForm");
const saveBookBtn = document.getElementById("saveBookBtn");
const coverInput = document.getElementById("coverInput");
const coverPreview = document.getElementById("coverPreview");
const coverPlaceholder = document.getElementById("coverPlaceholder");
const removeCoverBtn = document.getElementById("removeCoverBtn");
const coverUrlInput = document.getElementById("coverUrlInput");
const bookNameInput = document.getElementById("bookName");
const bookQtyInput = document.getElementById("bookQty");
const coverSuggestions = document.getElementById("coverSuggestions");

const lendModal = document.getElementById("lendModal");
const lendForm = document.getElementById("lendForm");
const saveLoanBtn = document.getElementById("saveLoanBtn");
const lendBookName = document.getElementById("lendBookName");
const loanDateInput = document.getElementById("loanDate");
const dueDateInput = document.getElementById("dueDate");
const borrowerNameInput = document.getElementById("borrowerName");
const borrowerClassInput = document.getElementById("borrowerClass");

const loansModal = document.getElementById("loansModal");
const loansList = document.getElementById("loansList");
const loansSubtitle = document.getElementById("loansSubtitle");

// Modal de aviso / confirmação / prompt (substitui alert/confirm/prompt nativos)
const noticeModal = document.getElementById("noticeModal");
const noticeTitleEl = document.getElementById("noticeTitle");
const noticeMessageEl = document.getElementById("noticeMessage");
const noticeInputField = document.getElementById("noticeInputField");
const noticeInputLabel = document.getElementById("noticeInputLabel");
const noticeInput = document.getElementById("noticeInput");
const noticeInputError = document.getElementById("noticeInputError");
const noticeCancelBtn = document.getElementById("noticeCancelBtn");
const noticeOkBtn = document.getElementById("noticeOkBtn");

let currentCoverData = null;
let viewingLoansBookId = null;

// ============================================================
//  Modal de aviso genérico (alerta / confirmação / prompt)
// ============================================================
let noticeResolve = null;
let noticeValidate = null;

// Mantém o scroll da página bloqueado enquanto qualquer modal estiver aberto.
function updateBodyScrollLock() {
  const anyOpen = [addModal, lendModal, loansModal, noticeModal].some((m) => !m.hidden);
  document.body.style.overflow = anyOpen ? "hidden" : "";
}

function closeNotice(result) {
  noticeModal.hidden = true;
  updateBodyScrollLock();
  if (noticeResolve) {
    noticeResolve(result);
    noticeResolve = null;
  }
  noticeValidate = null;
}

// Abre o modal de aviso e devolve uma Promise:
// - sem "input": resolve com true (OK) ou false (cancelar/fechar)
// - com "input": resolve com o texto digitado, ou false se cancelado
// options: { title, message, okText, cancelText (null = esconde o botão), input: { label, value, type, placeholder, validate(v) } }
function showNotice(options) {
  return new Promise((resolve) => {
    noticeResolve = resolve;
    noticeTitleEl.textContent = options.title || "Aviso";
    noticeMessageEl.textContent = options.message || "";
    noticeOkBtn.textContent = options.okText || "OK";
    noticeInputError.hidden = true;
    noticeInputError.textContent = "";

    if (options.input) {
      noticeInputField.hidden = false;
      noticeInputLabel.textContent = options.input.label || "";
      noticeInput.type = options.input.type || "text";
      noticeInput.value = options.input.value ?? "";
      noticeInput.placeholder = options.input.placeholder || "";
      noticeValidate = options.input.validate || null;
    } else {
      noticeInputField.hidden = true;
      noticeInput.value = "";
      noticeValidate = null;
    }

    if (options.cancelText !== null) {
      noticeCancelBtn.hidden = false;
      noticeCancelBtn.textContent = options.cancelText || "Cancelar";
    } else {
      noticeCancelBtn.hidden = true;
    }

    noticeModal.hidden = false;
    updateBodyScrollLock();

    setTimeout(() => {
      if (options.input) {
        noticeInput.focus();
        noticeInput.select();
      } else {
        noticeOkBtn.focus();
      }
    }, 0);
  });
}

// Atalho para um alerta simples (só "OK", sem cancelar).
function showAlert(title, message) {
  return showNotice({ title, message, cancelText: null });
}

noticeOkBtn.addEventListener("click", () => {
  if (noticeInputField.hidden) {
    closeNotice(true);
    return;
  }
  const value = noticeInput.value.trim();
  if (noticeValidate) {
    const err = noticeValidate(value);
    if (err) {
      noticeInputError.textContent = err;
      noticeInputError.hidden = false;
      noticeInput.focus();
      return;
    }
  }
  closeNotice(value);
});

noticeCancelBtn.addEventListener("click", () => closeNotice(false));

noticeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    noticeOkBtn.click();
  }
});

document.querySelectorAll("[data-notice-close]").forEach((el) => {
  el.addEventListener("click", () => closeNotice(false));
});

noticeModal.addEventListener("click", (e) => {
  if (e.target === noticeModal) closeNotice(false);
});

// ============================================================
//  Autenticação
// ============================================================

authTabButtons.forEach((tab) => {
  tab.addEventListener("click", () => {
    authTabButtons.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    Object.entries(authForms).forEach(([key, form]) => {
      form.hidden = key !== target;
    });
    loginError.hidden = true;
    signupError.hidden = true;
    resetError.hidden = true;
    resetMessage.hidden = true;
  });
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;
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
  const name = signupNameInput.value.trim();
  const email = signupEmailInput.value.trim();
  const password = signupPasswordInput.value;
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

resetForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  resetError.hidden = true;
  resetMessage.hidden = true;
  const email = resetEmailInput.value.trim();
  const btn = resetForm.querySelector(".auth-submit");
  btn.disabled = true;
  try {
    await resetPassword(email);
    resetMessage.textContent = "E-mail de recuperação enviado! Confira sua caixa de entrada (e o spam).";
    resetMessage.hidden = false;
  } catch (err) {
    resetError.textContent = authErrorMessage(err);
    resetError.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  closeModals();
  await signOutUser();
});

// Troca entre a tela de login e o app, reforçando com style.display
// além do atributo "hidden" (não depende de uma única forma de esconder).
function showAuthScreen(show) {
  authScreen.hidden = !show;
  authScreen.style.display = show ? "grid" : "none";
  appMain.hidden = show;
  appMain.style.display = show ? "none" : "block";
}

// Reage a login/logout: carrega (ou limpa) a biblioteca do usuário.
watchAuth(async (user) => {
  if (user) {
    currentUid = user.uid;
    showAuthScreen(false);
    userNameEl.textContent = user.displayName || user.email;
    currentView = "all";
    navViewButtons.forEach((b) => b.classList.toggle("active", b.dataset.view === "all"));

    legend.textContent = "Carregando biblioteca...";
    books = await initStorage(currentUid);
    console.log("[v0] Fonte de dados:", isUsingFirestore() ? "Firestore" : "localStorage");
    render();
  } else {
    currentUid = null;
    books = [];
    searchTerm = "";
    searchInput.value = "";
    showAuthScreen(true);
    closeModals();
    loginForm.reset();
    signupForm.reset();
    resetForm.reset();
    loginError.hidden = true;
    signupError.hidden = true;
    resetError.hidden = true;
    resetMessage.hidden = true;
  }
});

// ============================================================
//  Utilidades
// ============================================================
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

// Busca tanto pelo nome do livro quanto pelo nome/turma de quem pegou emprestado.
function matchesSearch(book, term) {
  if (!term) return true;
  if (book.name.toLowerCase().includes(term)) return true;
  return book.loans.some(
    (l) => (l.name || "").toLowerCase().includes(term) || (l.turma || "").toLowerCase().includes(term)
  );
}

// ============================================================
//  Navegação (Todos os Livros / Apenas Emprestados / Manual)
// ============================================================
navViewButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    navViewButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentView = btn.dataset.view;
    render();
  });
});

// ============================================================
//  Renderização
// ============================================================
function render() {
  const isManual = currentView === "manual";

  manualSection.hidden = !isManual;
  grid.hidden = isManual;
  legend.hidden = isManual;

  if (isManual) {
    emptyState.hidden = true;
    return;
  }

  const term = searchTerm.trim().toLowerCase();
  let filtered = books.filter((b) => matchesSearch(b, term));
  if (currentView === "loans") {
    filtered = filtered.filter((b) => b.loans.length > 0);
  }

  grid.innerHTML = "";

  filtered.forEach((book) => {
    const disp = available(book);
    const empr = book.loans.length;

    const card = document.createElement("article");
    card.className = "book-card";
    card.dataset.id = book.id;
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
          <button type="button" class="stat-edit" data-action="edit-qty" title="Editar quantidade total">
            <b>${book.total}</b> total
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
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

    grid.appendChild(card);
  });

  emptyState.hidden = filtered.length !== 0;

  const total = books.length;
  legend.textContent = `${total} ${total === 1 ? "título cadastrado" : "títulos cadastrados"} · disp. = disponíveis, empr. = emprestados, total = total de exemplares`;
}

// Um único listener no container em vez de um por card: menos trabalho
// a cada render() e nenhum listener "esquecido" ao recriar os cards.
grid.addEventListener("click", (e) => {
  const actionBtn = e.target.closest("[data-action]");
  if (!actionBtn) return;
  const card = actionBtn.closest(".book-card");
  const bookId = card?.dataset.id;
  if (!bookId) return;

  switch (actionBtn.dataset.action) {
    case "lend":
      openLend(bookId);
      break;
    case "loans":
      openLoans(bookId);
      break;
    case "delete":
      deleteBook(bookId);
      break;
    case "edit-qty":
      openEditQty(bookId);
      break;
  }
});

// ============================================================
//  Capa: upload, URL e remoção
// ============================================================
function setCover(value) {
  currentCoverData = value || null;
  if (value) {
    coverPreview.src = value;
    coverPreview.hidden = false;
    coverPlaceholder.hidden = true;
    removeCoverBtn.hidden = false;
  } else {
    coverPreview.hidden = true;
    coverPreview.src = "";
    coverPlaceholder.hidden = false;
    removeCoverBtn.hidden = true;
  }
}

document.getElementById("openAddBtn").addEventListener("click", () => openModal(addModal));

coverInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    coverUrlInput.value = "";
    setCover(reader.result);
  };
  reader.readAsDataURL(file);
});

// Permite colar uma URL de imagem direta em vez de buscar ou enviar um arquivo.
let coverUrlTimer = null;
coverUrlInput.addEventListener("input", () => {
  clearTimeout(coverUrlTimer);
  const value = coverUrlInput.value.trim();
  if (!value) return;
  coverUrlTimer = setTimeout(() => {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return; // ainda não é uma URL válida — espera o usuário continuar digitando
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
    setCover(value);
  }, 400);
});

removeCoverBtn.addEventListener("click", () => {
  coverUrlInput.value = "";
  coverSuggestions.querySelectorAll(".cover-sug-item").forEach((el) => el.classList.remove("selected"));
  setCover(null);
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

  const seen = new Set();
  const unique = combined.filter((item) => {
    const key = `${item.title.toLowerCase()}|${(item.author || "").toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const termLower = term.toLowerCase();
  unique.sort((a, b) => {
    const aStarts = a.title.toLowerCase().startsWith(termLower) ? 0 : 1;
    const bStarts = b.title.toLowerCase().startsWith(termLower) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return a.title.length - b.title.length;
  });

  const top = unique.slice(0, 8);

  if (top.length === 0) {
    coverSuggestions.innerHTML = `<p class="cover-sug-hint">Nenhuma capa encontrada. Você pode enviar uma imagem ou colar um link.</p>`;
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

    btn.querySelector("img").addEventListener("error", () => btn.remove());

    btn.addEventListener("click", () => {
      coverUrlInput.value = "";
      setCover(item.cover);
      coverSuggestions.querySelectorAll(".cover-sug-item").forEach((el) => el.classList.remove("selected"));
      btn.classList.add("selected");
    });
    row.appendChild(btn);
  });

  coverSuggestions.appendChild(row);
}

// ============================================================
//  Adicionar livro
// ============================================================
addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUid) return;
  const name = bookNameInput.value.trim();
  const qty = Math.max(1, parseInt(bookQtyInput.value, 10) || 1);
  if (!name) return;

  saveBookBtn.disabled = true;
  try {
    books = await storageAddBook(currentUid, books, { name, total: qty, cover: currentCoverData });
    render();
    closeModals();
  } catch (err) {
    console.log("[v0] Falha ao adicionar livro:", err);
    await showAlert("Erro", "Não foi possível adicionar o livro. Tente novamente.");
  } finally {
    saveBookBtn.disabled = false;
  }
});

// ============================================================
//  Alterar quantidade total (substitui o valor, não soma)
// ============================================================
async function openEditQty(bookId) {
  if (!currentUid) return;
  const book = books.find((b) => b.id === bookId);
  if (!book) return;

  const minAllowed = book.loans.length;
  const result = await showNotice({
    title: "Alterar quantidade total",
    message: `Defina a nova quantidade exata de exemplares de "${book.name}".`,
    okText: "Salvar",
    cancelText: "Cancelar",
    input: {
      label: "Quantidade total",
      type: "number",
      value: String(book.total),
      placeholder: "Ex.: 5",
      validate: (v) => {
        const n = parseInt(v, 10);
        if (v === "" || Number.isNaN(n) || n < 1) return "Informe um número válido maior que 0.";
        if (n < minAllowed) return `Não pode ser menor que ${minAllowed} (empréstimos ativos no momento).`;
        return null;
      },
    },
  });

  if (result === false) return; // cancelado
  const newTotal = parseInt(result, 10);
  if (newTotal === book.total) return;

  try {
    books = await storageUpdateQty(currentUid, books, bookId, newTotal);
    render();
  } catch (err) {
    console.log("[v0] Falha ao alterar quantidade:", err);
    await showAlert("Erro", "Não foi possível alterar a quantidade. Tente novamente.");
  }
}

// ============================================================
//  Emprestar livro
// ============================================================
function openLend(bookId) {
  const book = books.find((b) => b.id === bookId);
  if (!book || available(book) === 0) return;
  lendingBookId = bookId;
  lendBookName.textContent = book.name;
  lendForm.reset();

  const today = new Date().toISOString().slice(0, 10);
  loanDateInput.value = today;

  const maxDue = addDaysIso(today, MAX_LOAN_DAYS);
  dueDateInput.value = maxDue;
  dueDateInput.min = today;
  dueDateInput.max = maxDue;

  openModal(lendModal);
}

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

  const loanDate = loanDateInput.value;
  let dueDate = dueDateInput.value;
  const maxDue = addDaysIso(loanDate, MAX_LOAN_DAYS);
  if (!dueDate || dueDate > maxDue) dueDate = maxDue;

  saveLoanBtn.disabled = true;
  try {
    books = await storageAddLoan(currentUid, books, lendingBookId, {
      name: borrowerNameInput.value.trim(),
      turma: borrowerClassInput.value.trim(),
      loanDate,
      dueDate,
    });
    render();
    closeModals();
  } catch (err) {
    console.log("[v0] Falha ao registrar empréstimo:", err);
    await showAlert("Erro", "Não foi possível registrar o empréstimo. Tente novamente.");
  } finally {
    saveLoanBtn.disabled = false;
  }
});

// ============================================================
//  Lista de empréstimos
// ============================================================
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
    const returnBtn = li.querySelector(".loan-return");
    returnBtn.addEventListener("click", async () => {
      if (!currentUid) return;
      returnBtn.disabled = true;
      try {
        books = await storageRemoveLoan(currentUid, books, book.id, loan.id);
        renderLoans();
        render();
      } catch (err) {
        console.log("[v0] Falha ao registrar devolução:", err);
        returnBtn.disabled = false;
        await showAlert("Erro", "Não foi possível registrar a devolução. Tente novamente.");
      }
    });
    loansList.appendChild(li);
  });
}

// ============================================================
//  Excluir livro
// ============================================================
async function deleteBook(bookId) {
  if (!currentUid) return;
  const book = books.find((b) => b.id === bookId);
  if (!book) return;

  const confirmed = await showNotice({
    title: "Excluir livro",
    message: `Excluir "${book.name}"? Esta ação não pode ser desfeita.`,
    okText: "Excluir",
    cancelText: "Cancelar",
  });
  if (!confirmed) return;

  try {
    books = await storageDeleteBook(currentUid, books, bookId);
    render();
  } catch (err) {
    console.log("[v0] Falha ao excluir livro:", err);
    await showAlert("Erro", "Não foi possível excluir o livro. Tente novamente.");
  }
}

// ============================================================
//  Busca
// ============================================================
searchInput.addEventListener("input", (e) => {
  searchTerm = e.target.value;
  render();
});

// ============================================================
//  Modais de formulário (Adicionar / Emprestar / Empréstimos)
// ============================================================
function openModal(modal) {
  modal.hidden = false;
  updateBodyScrollLock();
}

function closeModals() {
  [addModal, lendModal, loansModal].forEach((m) => (m.hidden = true));
  updateBodyScrollLock();
  addForm.reset();
  coverUrlInput.value = "";
  setCover(null);
  coverSuggestions.hidden = true;
  coverSuggestions.innerHTML = "";
  lastCoverQuery = "";
}

document.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModals));

// O modal de aviso (noticeModal) tem seu próprio fechamento — não entra
// neste listener genérico, senão clicar fora dele fecharia o modal errado.
document.querySelectorAll(".modal-overlay:not(#noticeModal)").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModals();
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!noticeModal.hidden) {
    closeNotice(false);
    return;
  }
  closeModals();
});
