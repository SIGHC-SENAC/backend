import express from "express";
import { requireSuperAdmin, requireCoordenador } from "../middlewares/authMiddleware.js";
import { listarTurmas, buscarTurma, criarTurma, atualizarTurma, deletarTurma } from "../controllers/turmasController.js";

const router = express.Router();

/**
 * Rotas para gerenciamento de turmas.
 * Essencial para organizar alunos dentro de seus respectivos períodos e cursos.
 */

// Lista turmas (pode ser filtrado por cursoId via query string)
router.get("/", ...requireCoordenador, listarTurmas);
// Obtém dados de uma turma específica
router.get("/:id", ...requireCoordenador, buscarTurma);
// Cadastra uma nova turma associada a um curso existente
router.post("/", ...requireSuperAdmin, criarTurma);
// Atualiza os dados de uma turma (horários, períodos, etc)
router.put("/:id", ...requireSuperAdmin, atualizarTurma);
// Exclui uma turma do sistema
router.delete("/:id", ...requireSuperAdmin, deletarTurma);

export default router;
