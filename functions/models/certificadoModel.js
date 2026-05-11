import { db } from "../config/firebase.js";

export async function registrarUploadSuspeito(data) {
  await db.collection("uploads_suspeitos").add(data);
}

export async function criarCertificadoHorasComplementares(data) {
  await db.collection("certificados_horas_complementares").add(data);
}
