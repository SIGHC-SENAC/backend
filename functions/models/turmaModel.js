import { db } from "../config/firebase.js";

const COLLECTION = "turmas";

function toTurma(doc) {
  return { id: doc.id, ...doc.data() };
}

export async function listarTurmasOrdenadas(cursoId) {
  let query = db.collection(COLLECTION).orderBy("criadoEm", "desc");
  if (cursoId) {
    query = db.collection(COLLECTION).where("cursoId", "==", cursoId);
  }

  const snapshot = await query.get();
  return snapshot.docs
    .map(toTurma)
    .sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
}

export async function buscarTurmaPorId(id) {
  const doc = await db.collection(COLLECTION).doc(id).get();
  return doc.exists ? toTurma(doc) : null;
}

export async function criarTurma(data) {
  const docRef = await db.collection(COLLECTION).add(data);
  return docRef.id;
}

export async function atualizarTurma(id, data) {
  await db.collection(COLLECTION).doc(id).update(data);
}

export async function deletarTurma(id) {
  await db.collection(COLLECTION).doc(id).delete();
}
