// ============================================================
//  Camada de armazenamento e autenticação do CEEP's Library
//  - Login por e-mail/senha via Firebase Authentication.
//  - Cada usuário tem sua própria "biblioteca", guardada em
//    users/{uid}/books/{bookId} no Firestore.
//  - Se o Firestore não estiver acessível, cai para localStorage,
//    isolado por usuário (a chave inclui o uid).
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// >>> Configuração do seu projeto Firebase (Console > Configurações do projeto)
const firebaseConfig = {
  apiKey: "AIzaSyD_N7a1MfDw4XRppIsLajd39dEng_zkYkI",
  authDomain: "gerenciamento-de-livros-6c370.firebaseapp.com",
  projectId: "gerenciamento-de-livros-6c370",
  storageBucket: "gerenciamento-de-livros-6c370.firebasestorage.app",
  messagingSenderId: "658863302678",
  appId: "1:658863302678:web:83d5e4165cfe19db25ed37",
  measurementId: "G-YXFS66C45R"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let db = null;
try {
  db = getFirestore(app);
} catch (e) {
  console.log("[v0] Firestore indisponível:", e.message);
}

let mode = "cloud"; // "cloud" (Firestore) ou "local" (localStorage)
let currentUser = null;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function localKey(userUid) {
  return `ceeps-library-books-${userUid}`;
}

// Dados iniciais (usados só no modo localStorage, na 1ª vez de cada usuário)
function seedBooks() {
  return [
    { id: uid(), name: "Dom Casmurro", total: 5, cover: null, loans: [] },
    { id: uid(), name: "O Cortiço", total: 3, cover: null, loans: [] },
  ];
}

// ---------- localStorage helpers (isolados por usuário) ----------
function readLocal(userUid) {
  try {
    const raw = localStorage.getItem(localKey(userUid));
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.log("[v0] Falha ao ler localStorage:", e);
  }
  return null;
}

function writeLocal(userUid, books) {
  try {
    localStorage.setItem(localKey(userUid), JSON.stringify(books));
  } catch (e) {
    console.log("[v0] Falha ao salvar localStorage:", e);
  }
}

// ---------- Firestore helpers ----------
function booksCollection(userUid) {
  return collection(db, "users", userUid, "books");
}

async function fetchAllBooks(userUid) {
  const snap = await getDocs(booksCollection(userUid));
  return snap.docs.map((d) => ({ id: d.id, loans: [], ...d.data() }));
}

// ============================================================
//  Autenticação
// ============================================================

// Chama callback(user | null) imediatamente e sempre que o login mudar.
// Retorna uma função para cancelar a inscrição, se precisar.
export function watchAuth(callback) {
  return onAuthStateChanged(auth, (user) => {
    currentUser = user;
    callback(user);
  });
}

export function getCurrentUser() {
  return currentUser;
}

export async function signUp(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  return cred.user;
}

export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOutUser() {
  await firebaseSignOut(auth);
}

// Traduz os códigos de erro do Firebase Auth para mensagens em pt-BR.
export function authErrorMessage(err) {
  const map = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Não existe conta com esse e-mail.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Já existe uma conta com esse e-mail.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/missing-password": "Informe uma senha.",
    "auth/too-many-requests": "Muitas tentativas seguidas. Tente novamente em instantes.",
    "auth/network-request-failed": "Falha de conexão. Verifique sua internet.",
  };
  return map[err.code] || "Não foi possível concluir a operação. Tente novamente.";
}

// ============================================================
//  Biblioteca (por usuário)
// ============================================================

// Carrega os livros do usuário logado (Firestore, com fallback local).
export async function initStorage(userUid) {
  if (db) {
    try {
      const books = await fetchAllBooks(userUid);
      mode = "cloud";
      console.log("[v0] Conectado ao Firebase Firestore.");
      return books;
    } catch (e) {
      console.log("[v0] Firestore indisponível — usando localStorage.", e.message);
    }
  }
  mode = "local";
  let local = readLocal(userUid);
  if (!local) {
    local = seedBooks();
    writeLocal(userUid, local);
  }
  return local;
}

// Retorna true quando os dados estão vindo do Firestore (nuvem).
export function isUsingFirestore() {
  return mode === "cloud";
}

// Cada operação recebe o uid do usuário dono da biblioteca e o array
// atual "books" (usado apenas no modo local) e devolve o array atualizado.

export async function addBook(userUid, books, { name, total, cover }) {
  if (mode === "cloud") {
    await addDoc(booksCollection(userUid), {
      name,
      total,
      cover: cover || null,
      loans: [],
    });
    return fetchAllBooks(userUid);
  }
  books.push({ id: uid(), name, total, cover, loans: [] });
  writeLocal(userUid, books);
  return books;
}

export async function deleteBook(userUid, books, id) {
  if (mode === "cloud") {
    await deleteDoc(doc(db, "users", userUid, "books", id));
    return fetchAllBooks(userUid);
  }
  const next = books.filter((b) => b.id !== id);
  writeLocal(userUid, next);
  return next;
}

export async function addLoan(userUid, books, bookId, loan) {
  const loanEntry = { id: uid(), ...loan };
  if (mode === "cloud") {
    const book = books.find((b) => b.id === bookId);
    const updatedLoans = [...(book?.loans || []), loanEntry];
    await updateDoc(doc(db, "users", userUid, "books", bookId), { loans: updatedLoans });
    return fetchAllBooks(userUid);
  }
  const book = books.find((b) => b.id === bookId);
  if (book) book.loans.push(loanEntry);
  writeLocal(userUid, books);
  return books;
}

export async function updateQty(userUid, books, bookId, newTotal) {
  if (mode === "cloud") {
    await updateDoc(doc(db, "users", userUid, "books", bookId), { total: newTotal });
    return fetchAllBooks(userUid);
  }
  const book = books.find((b) => b.id === bookId);
  if (book) book.total = newTotal;
  writeLocal(userUid, books);
  return books;
}

export async function removeLoan(userUid, books, bookId, loanId) {
  if (mode === "cloud") {
    const book = books.find((b) => b.id === bookId);
    const updatedLoans = (book?.loans || []).filter((l) => l.id !== loanId);
    await updateDoc(doc(db, "users", userUid, "books", bookId), { loans: updatedLoans });
    return fetchAllBooks(userUid);
  }
  const book = books.find((b) => b.id === bookId);
  if (book) book.loans = book.loans.filter((l) => l.id !== loanId);
  writeLocal(userUid, books);
  return books;
}
