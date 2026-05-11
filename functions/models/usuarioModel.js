import { db } from "../config/firebase.js";

const COLLECTION = "users";

function toUsuario(doc) {
  return { id: doc.id, ...doc.data() };
}

export function usuarioRef(id) {
  return db.collection(COLLECTION).doc(id);
}

export async function listarUsuariosPorRole(role) {
  const snapshot = await db.collection(COLLECTION).where("role", "==", role).get();
  return snapshot.docs.map(toUsuario);
}

export async function listarDocsUsuariosPorRole(role) {
  return db.collection(COLLECTION).where("role", "==", role).get();
}

export async function buscarUsuarioPorId(id) {
  const doc = await usuarioRef(id).get();
  return doc.exists ? toUsuario(doc) : null;
}

export async function criarUsuarioComId(id, data) {
  await usuarioRef(id).set(data);
}

export async function atualizarUsuario(id, data) {
  await usuarioRef(id).update(data);
}

export async function deletarUsuario(id) {
  await usuarioRef(id).delete();
}

export async function salvarRoleUsuario(id, role) {
  await usuarioRef(id).set({ role }, { merge: true });
}
