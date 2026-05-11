// roleController.js
import { auth_firebase } from "../config/firebase.js";
import { salvarRoleUsuario } from "../models/usuarioModel.js";

/**
 * Define manualmente o papel (role) de um usuário.
 * Atualiza os Custom Claims no Firebase Auth e o campo 'role' no documento do usuário.
 * @param {Object} req - Body com 'uid' e 'role' ("admin", "aluno", "superAdmin").
 * @param {Object} res - Confirmação da alteração.
 */
export async function setUserRole(req, res) {
  try {
    const { uid, role } = req.body; // role: "admin" | "aluno" | "superAdmin"
    if (!uid || !["admin", "aluno", "superAdmin"].includes(role)) {
      return res.status(400).json({ error: "uid e role válidos são obrigatórios" });
    }

    await auth_firebase.setCustomUserClaims(uid, { role });
    await salvarRoleUsuario(uid, role);

    return res.json({ ok: true, uid, role });
  } catch (e) {
    return res.status(500).json({ error: "Falha ao setar role", details: String(e) });
  }
}
