// ============================================================
//  Camada de armazenamento do CEEP's Library
//  - Usa o Firebase Firestore como banco de dados na nuvem.
//  - Se o Firestore não estiver configurado/acessível, cai
//    automaticamente para localStorage (assim o site continua
//    funcionando mesmo sem conexão com o Firebase).
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
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
  apiKey: "AIzaSyATYQUc149XGdgWEV7ULDgeLUH-fBaUQoE",
  authDomain: "ceep-s-library.firebaseapp.com",
  projectId: "ceep-s-library",
  storageBucket: "ceep-s-library.firebasestorage.app",
  messagingSenderId: "625932434227",
  appId: "1:625932434227:web:390f5a313a7d6a21ce1c46",
  measurementId: "G-P37LL6N07B",
};

const STORAGE_KEY = "ceeps-library-books";
const BOOKS_COLLECTION = "books";

let mode = "cloud"; // "cloud" (Firestore) ou "local" (localStorage)
let db = null;

// Dados iniciais (usados só no modo localStorage)
const seedBooks = [
  { id: uid(), name: "Dom Casmurro", total: 5, cover: null, loans: [] },
  { id: uid(), name: "O Cortiço", total: 3, cover: null, loans: [] },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ---------- localStorage helpers ----------
function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.log("[v0] Falha ao ler localStorage:", e);
  }
  return null;
}

function writeLocal(books) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
  } catch (e) {
    console.log("[v0] Falha ao salvar localStorage:", e);
  }
}

// ---------- Firestore helpers ----------
async function fetchAllBooks() {
  const snap = await getDocs(collection(db, BOOKS_COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, loans: [], ...d.data() }));
}

// ---------- Inicialização ----------
// Tenta conectar ao Firestore. Se falhar, usa localStorage.
export async function initStorage() {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    const books = await fetchAllBooks();
    mode = "cloud";
    console.log("[v0] Conectado ao Firebase Firestore.");
    return books;
  } catch (e) {
    mode = "local";
    console.log("[v0] Firestore indisponível — usando localStorage.", e.message);
    let local = readLocal();
    if (!local) {
      local = seedBooks;
      writeLocal(local);
    }
    return local;
  }
}

// Retorna true quando os dados estão vindo do Firestore (nuvem).
export function isUsingFirestore() {
  return mode === "cloud";
}

// ---------- Operações ----------
// Cada operação recebe o array atual "books" para o modo local
// e devolve o array atualizado (recarregado da fonte de dados).

export async function addBook(books, { name, total, cover }) {
  if (mode === "cloud") {
    await addDoc(collection(db, BOOKS_COLLECTION), {
      name,
      total,
      cover: cover || null,
      loans: [],
    });
    return fetchAllBooks();
  }
  books.push({ id: uid(), name, total, cover, loans: [] });
  writeLocal(books);
  return books;
}

export async function deleteBook(books, id) {
  if (mode === "cloud") {
    await deleteDoc(doc(db, BOOKS_COLLECTION, id));
    return fetchAllBooks();
  }
  const next = books.filter((b) => b.id !== id);
  writeLocal(next);
  return next;
}

export async function addLoan(books, bookId, loan) {
  const loanEntry = { id: uid(), ...loan };
  if (mode === "cloud") {
    const book = books.find((b) => b.id === bookId);
    const updatedLoans = [...(book?.loans || []), loanEntry];
    await updateDoc(doc(db, BOOKS_COLLECTION, bookId), { loans: updatedLoans });
    return fetchAllBooks();
  }
  const book = books.find((b) => b.id === bookId);
  if (book) book.loans.push(loanEntry);
  writeLocal(books);
  return books;
}

export async function updateQty(books, bookId, newTotal) {
  if (mode === "cloud") {
    await updateDoc(doc(db, BOOKS_COLLECTION, bookId), { total: newTotal });
    return fetchAllBooks();
  }
  const book = books.find((b) => b.id === bookId);
  if (book) book.total = newTotal;
  writeLocal(books);
  return books;
}

export async function removeLoan(books, bookId, loanId) {
  if (mode === "cloud") {
    const book = books.find((b) => b.id === bookId);
    const updatedLoans = (book?.loans || []).filter((l) => l.id !== loanId);
    await updateDoc(doc(db, BOOKS_COLLECTION, bookId), { loans: updatedLoans });
    return fetchAllBooks();
  }
  const book = books.find((b) => b.id === bookId);
  if (book) book.loans = book.loans.filter((l) => l.id !== loanId);
  writeLocal(books);
  return books;
}
