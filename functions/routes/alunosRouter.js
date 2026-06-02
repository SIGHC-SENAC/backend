import express from "express";
import { listarAlunos, criarAluno, atualizarAluno, deletarAluno } from "../controllers/alunosController.js";
import { requireSuperAdmin, requireCoordenador } from "../middlewares/authMiddleware.js";

const router = express.Router();

/**
 * Rotas para gerenciamento de alunos.
 * Permite a gestão completa de perfis acadêmicos por Super Admins.
 * Coordenadores podem listar alunos dos seus cursos.
 */
// Rota para listar alunos (aceita 'cursoId' como query parameter para filtragem)
router.get("/", ...requireCoordenador, listarAlunos);
// Rota para cadastrar um novo aluno, vinculando-o a um curso e turma específicos
router.post("/", ...requireSuperAdmin, criarAluno);
// Rota para atualizar os dados de um aluno (nome, curso, turma, etc)
router.put("/:id", ...requireSuperAdmin, atualizarAluno);
// Rota para remover um aluno do sistema
router.delete("/:id", ...requireSuperAdmin, deletarAluno);

export default router;
