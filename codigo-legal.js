import {
  watchAuth,
  signUp,
  signIn,
  resetPassword,
  signOutUser,
  authErrorMessage,
  initStorage,
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
let currentView = "all";

// ---------- Elementos DOM ----------
const authScreen = document.getElementById("authScreen");
const appMain = document.getElementById("appMain");
const authTabs = document.querySelectorAll(".auth-tab:not(.nav-view)");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const resetForm = document.getElementById("resetForm");
const loginError = document.getElementById("loginError");
const signupError = document.getElementById("signupError");
const resetError = document.getElementById("resetError");
const resetMessage = document.getElementById("resetMessage");
const userNameEl = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");

const navViews = document.querySelectorAll(".nav-view");
const manualSection = document.getElementById("manualSection");

const grid = document.getElementById("booksGrid");
const emptyState = document.getElementById("emptyState");
const legend = document.getElementById("legend");
const searchInput = document.getElementById("searchInput");

const addModal = document.getElementById("addModal");
const addForm = document.getElementById("addForm");
const coverInput = document.getElementById("coverInput");
const coverUrlInput = document.getElementById("coverUrlInput");
const coverPreview = document.getElementById("coverPreview");
const coverPlaceholder = document.getElementById("coverPlaceholder");
const removeCoverBtn = document.getElementById("removeCoverBtn");
const saveBookBtn = document.getElementById("saveBookBtn");

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
// COMPRESSÃO DE IMAGENS (UPLOAD DO DISPOSITIVO)
// ============================================================

function compressImage(file, maxWidth = 400, maxHeight = 600, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Erro ao carregar imagem"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

function updateCoverPreview(src) {
  if (src) {
    currentCoverData = src;
    coverPreview.src = src;
    coverPreview.hidden = false;
    if (coverPlaceholder) coverPlaceholder.hidden = true;
    if (removeCoverBtn) removeCoverBtn.hidden = false;
  } else {
    currentCoverData = null;
    coverPreview.src = "";
    coverPreview.hidden = true;
    if (coverPlaceholder) coverPlaceholder.hidden = false;
    if (removeCoverBtn) removeCoverBtn.hidden = true;
  }
}

// ============================================================
// NOVO SISTEMA DE RECOMENDAÇÃO (RESISTENTE A FALHAS)
// ============================================================

let searchDebounce = null;
let currentSearchId = 0;

bookNameInput.addEventListener("input", () => {
  const query = bookNameInput.value.trim();
  clearTimeout(searchDebounce);

  if (query.length < 2) {
    coverSuggestions.hidden = true;
    coverSuggestions.innerHTML = "";
    return;
  }

  searchDebounce = setTimeout(() => fetchBookCovers(query), 350);
});

async function fetchBookCovers(query) {
  const searchId = ++currentSearchId;
  coverSuggestions.hidden = false;
  coverSuggestions.innerHTML = `<p class="cover-sug-hint"><span class="cover-sug-spinner" aria-hidden="true"></span>Procurando capas...</p>`;

  const cleanQuery = query.replace(/[^\w\sà-úÀ-Ú]/gi, " ").trim();

  // Executa requisições individuais com tratamento de erro independente
  const googlePromise = fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(cleanQuery)}&maxResults=5`)
    .then((r) => r.json())
    .then((d) => (d.items || []).map((i) => i.volumeInfo?.imageLinks?.thumbnail?.replace("http://", "https://")).filter(Boolean))
    .catch(() => []);

  const openLibPromise = fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(cleanQuery)}&limit=5`)
    .then((r) => r.json())
    .then((d) => (d.docs || []).map((doc) => doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null).filter(Boolean))
    .catch(() => []);

  const wikiPromise = fetch(`https://pt.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=0&gsrlimit=3&gsrsearch=${encodeURIComponent(cleanQuery)}&prop=pageimages&piprop=thumbnail&pithumbsize=400`)
    .then((r) => r.json())
    .then((d) => {
      if (!d.query?.pages) return [];
      return Object.values(d.query.pages).map((p) => p.thumbnail?.source).filter(Boolean);
    })
    .catch(() => []);

  const [google, openLib, wiki] = await Promise.all([googlePromise, openLibPromise, wikiPromise]);

  if (searchId !== currentSearchId) return;

  const allCovers = Array.from(new Set([...google, ...openLib, ...wiki]));

  if (allCovers.length === 0) {
    coverSuggestions.innerHTML = `<p class="cover-sug-hint">Nenhuma capa encontrada. Digite a URL ou faça upload de um arquivo.</p>`;
    return;
  }

  // Define a 1ª opção encontrada no preview de forma imediata
  if (!currentCoverData || !currentCoverData.startsWith("data:")) {
    updateCoverPreview(allCovers[0]);
  }

  coverSuggestions.innerHTML = `<p class="cover-sug-hint">Sugestões (clique em uma para selecionar):</p>`;
  const row = document.createElement("div");
  row.className = "cover-sug-row";

  allCovers.slice(0, 8).forEach((url, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `cover-sug-item ${index === 0 ? "selected" : ""}`;

    const img = document.createElement("img");
    img.src = url;
    img.alt = "Capa recomendada";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";

    // Se o link da imagem quebrar, remove a miniatura do painel silenciosamente
    img.onerror = () => {
      btn.remove();
      if (row.children.length === 0) {
        coverSuggestions.innerHTML = `<p class="cover-sug-hint">Nenhuma capa disponível. Faça o upload manual.</p>`;
      }
    };

    btn.appendChild(img);

    btn.addEventListener("click", () => {
      coverInput.value = "";
      coverUrlInput.value = "";
      updateCoverPreview(url);
      coverSuggestions.querySelectorAll(".cover-sug-item").forEach((el) => el.classList.remove("selected"));
      btn.classList.add("selected");
    });

    row.appendChild(btn);
  });

  coverSuggestions.appendChild(row);
}

// ============================================================
// AUTENTICAÇÃO
// ============================================================

authTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    authTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    loginForm.hidden = target !== "login";
    signupForm.hidden = target !== "signup";
    resetForm.hidden = target !== "reset";
    loginError.hidden = true;
    signupError.hidden = true;
    resetError.hidden = true;
    resetMessage.hidden = true;
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
  const email = document.getElementById("resetEmail").value.trim();
  const btn = resetForm.querySelector(".auth-submit");
  btn.disabled = true;
  try {
    await resetPassword(email);
    resetMessage.textContent = "E-mail de redefinição enviado!";
    resetMessage.hidden = false;
    resetForm.reset();
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

function showAuthScreen(show) {
  authScreen.hidden = !show;
  authScreen.style.display = show ? "grid" : "none";
  appMain.hidden = show;
  appMain.style.display = show ? "none" : "block";
}

watchAuth(async (user) => {
  if (user) {
    currentUid = user.uid;
    showAuthScreen(false);
    userNameEl.textContent = user.displayName || user.email;
    books = await initStorage(currentUid);
    render();
  } else {
    currentUid = null;
    books = [];
    searchTerm = "";
    searchInput.value = "";
    showAuthScreen(true);
    closeModals();
  }
});

navViews.forEach((btn) => {
  btn.addEventListener("click", () => {
    navViews.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentView = btn.dataset.view;
    render();
  });
});

// ============================================================
// GERENCIAMENTO DA INTERFACE E LIVROS
// ============================================================

function available(book) {
  return book.total - book.loans.length;
}

function formatDate(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function addDaysIso(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function render() {
  if (currentView === "manual") {
    grid.hidden = true;
    manualSection.hidden = false;
    emptyState.hidden = true;
    legend.hidden = true;
    return;
  }

  grid.hidden = false;
  manualSection.hidden = true;
  legend.hidden = false;

  const term = searchTerm.trim().toLowerCase();

  let filtered = books.filter((b) => {
    const matchBook = b.name.toLowerCase().includes(term);
    const matchStudent = b.loans.some(
      (l) => (l.name && l.name.toLowerCase().includes(term)) || (l.turma && l.turma.toLowerCase().includes(term))
    );
    return matchBook || matchStudent;
  });

  if (currentView === "loans") {
    filtered = filtered.filter((b) => b.loans.length > 0);
  }

  grid.innerHTML = "";

  filtered.forEach((book) => {
    const disp = available(book);
    const empr = book.loans.length;

    const studentsListHtml =
      empr > 0
        ? `<div style="margin-top: 8px; font-size: 0.8rem; background:#faf5f0; padding:6px 10px; border-radius:6px; border:1px solid var(--line);">
          <strong>Com os alunos:</strong>
          <ul style="margin:4px 0 0; padding-left:16px;">
            ${book.loans.map((l) => `<li><b>${escapeHtml(l.name)}</b> ${l.turma ? `(${escapeHtml(l.turma)})` : ""} - até ${formatDate(l.dueDate)}</li>`).join("")}
          </ul>
         </div>`
        : "";

    const card = document.createElement("article");
    card.className = "book-card";
    card.innerHTML = `
      <div class="card-cover">
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
        ${studentsListHtml}
      </div>
      <div class="card-actions">
        <button class="btn-action" data-action="lend" ${disp === 0 ? "disabled" : ""}>
          Emprestar
        </button>
        <button class="btn-action" data-action="loans">
          Empréstimos ${empr > 0 ? `<span class="count">${empr}</span>` : ""}
        </button>
        <button class="btn-action" data-action="addCopies" aria-label="Adicionar exemplares de ${escapeHtml(book.name)}" title="Adicionar mais exemplares">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          Exemplares
        </button>
        <button class="btn-icon" data-action="delete" aria-label="Excluir ${escapeHtml(book.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>
    `;

    card.querySelector('[data-action="lend"]').addEventListener("click", () => openLend(book.id));
    card.querySelector('[data-action="loans"]').addEventListener("click", () => openLoans(book.id));
    card.querySelector('[data-action="addCopies"]').addEventListener("click", () => addCopies(book.id));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteBook(book.id));

    grid.appendChild(card);
  });

  emptyState.hidden = filtered.length !== 0;
  const totalTitles = books.length;
  const totalBorrowed = books.reduce((acc, b) => acc + b.loans.length, 0);
  legend.textContent = `${totalTitles} títulos cadastrados · ${totalBorrowed} exemplares atualmente emprestados`;
}

// Entradas de upload manual e link
coverInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const compressed = await compressImage(file);
    coverUrlInput.value = "";
    updateCoverPreview(compressed);
  } catch (err) {
    alert("Não foi possível carregar a imagem.");
  }
});

coverUrlInput.addEventListener("input", () => {
  const url = coverUrlInput.value.trim();
  if (url) {
    coverInput.value = "";
    updateCoverPreview(url);
  } else if (!currentCoverData?.startsWith("data:")) {
    updateCoverPreview(null);
  }
});

if (removeCoverBtn) {
  removeCoverBtn.addEventListener("click", () => {
    coverInput.value = "";
    coverUrlInput.value = "";
    updateCoverPreview(null);
  });
}

document.getElementById("openAddBtn").addEventListener("click", () => openModal(addModal));

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUid) return;

  const name = bookNameInput.value.trim();
  const qty = Math.max(1, parseInt(document.getElementById("bookQty").value, 10) || 1);
  if (!name) return;

  saveBookBtn.disabled = true;
  saveBookBtn.textContent = "Salvando...";

  try {
    books = await storageAddBook(currentUid, books, { name, total: qty, cover: currentCoverData });
    render();
    closeModals();
  } catch (err) {
    alert("Erro ao salvar o livro: " + (err.message || "Tente novamente."));
  } finally {
    saveBookBtn.disabled = false;
    saveBookBtn.textContent = "Adicionar livro";
  }
});

// ---------- Empréstimos & Exclusão ----------
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

  books = await storageAddLoan(currentUid, books, lendingBookId, {
    name: document.getElementById("borrowerName").value.trim(),
    turma: document.getElementById("borrowerClass").value.trim(),
    loanDate,
    dueDate,
  });
  render();
  closeModals();
});

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

async function addCopies(bookId) {
  if (!currentUid) return;
  const book = books.find((b) => b.id === bookId);
  if (!book) return;

  const input = prompt(`Quantos exemplares de "${book.name}" deseja adicionar ao total atual (${book.total})?`, "1");
  if (input === null) return;

  const qtyToAdd = parseInt(input, 10);
  if (!Number.isInteger(qtyToAdd) || qtyToAdd <= 0) {
    alert("Informe um número inteiro maior que zero.");
    return;
  }

  try {
    books = await storageUpdateQty(currentUid, books, bookId, book.total + qtyToAdd);
    render();
  } catch (err) {
    alert("Erro ao atualizar a quantidade: " + (err.message || "Tente novamente."));
  }
}

async function deleteBook(bookId) {
  if (!currentUid) return;
  const book = books.find((b) => b.id === bookId);
  if (!book) return;
  if (confirm(`Excluir "${book.name}"? Esta ação não pode ser desfeita.`)) {
    books = await storageDeleteBook(currentUid, books, bookId);
    render();
  }
}

searchInput.addEventListener("input", (e) => {
  searchTerm = e.target.value;
  render();
});

function openModal(modal) {
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModals() {
  [addModal, lendModal, loansModal].forEach((m) => (m.hidden = true));
  document.body.style.overflow = "";
  addForm.reset();
  updateCoverPreview(null);
  coverSuggestions.hidden = true;
  coverSuggestions.innerHTML = "";
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
