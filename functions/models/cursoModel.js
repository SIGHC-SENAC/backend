import { db } from "../config/firebase.js";

const COLLECTION = "cursos";

function toCurso(doc) {
  return { id: doc.id, ...doc.data() };
}

export async function listarCursosOrdenados() {
  const snapshot = await db.collection(COLLECTION).orderBy("criadoEm", "desc").get();
  return snapshot.docs.map(toCurso);
}

export async function buscarCursoPorId(id) {
  const doc = await db.collection(COLLECTION).doc(id).get();
  return doc.exists ? toCurso(doc) : null;
}

export async function existeCursoComCodigo(codigo) {
  const snapshot = await db.collection(COLLECTION).where("codigo", "==", codigo).get();
  return !snapshot.empty;
}

export async function gerarCodigoCurso() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const codigo = String(Math.floor(10000 + Math.random() * 90000));
    if (!(await existeCursoComCodigo(codigo))) return codigo;
  }

  return String(Date.now()).slice(-5);
}

export async function criarCurso(data) {
  const docRef = await db.collection(COLLECTION).add(data);
  return docRef.id;
}

export async function atualizarCurso(id, data) {
  await db.collection(COLLECTION).doc(id).update(data);
}

export async function deletarCurso(id) {
  await db.collection(COLLECTION).doc(id).delete();
}
