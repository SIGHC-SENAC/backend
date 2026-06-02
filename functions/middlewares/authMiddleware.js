import { auth_firebase } from "../config/firebase.js";

/**
 * Middleware para exigir autenticação.
 * Extrai o token Bearer do cabeçalho Authorization e valida via Firebase Admin SDK.
 * 
 * @returns {void} Adiciona o objeto 'user' ao objeto 'req' ou retorna erro 401.
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) return res.status(401).json({ error: "Token ausente" });

    const decoded = await auth_firebase.verifyIdToken(token);

    req.user = {
      uid: decoded.uid,
      // Se a role não estiver definida nos Custom Claims, assume 'aluno' por padrão
      role: decoded.role || "aluno",
      email: decoded.email,
    };

    return next();
  } catch (e) {
    return res.status(401).json({ error: "Token inválido", details: String(e) });
  }
}

/**
 * Middleware de autorização baseado em papéis (RBAC).
 * Verifica se a role do usuário autenticado está presente na lista de papéis permitidos.
 * 
 * @param {...string} allowedRoles - Lista de papéis autorizados (ex: 'admin', 'superAdmin').
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Não autenticado" });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Sem permissão" });
    }
    return next();
  };
}

// Atalhos para combinações comuns de middleware de autenticação e autorização
export const requireAdmin = [requireAuth, requireRole("admin", "superAdmin")];
export const requireSuperAdmin = [requireAuth, requireRole("superAdmin")];
export const requireCoordenador = [requireAuth, requireRole("coordenador", "admin", "superAdmin")];
export const requireAluno = [requireAuth, requireRole("aluno")];
