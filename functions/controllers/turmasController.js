import { buscarCursoPorId } from "../models/cursoModel.js";
import {
  atualizarTurma as atualizarTurmaModel,
  buscarTurmaPorId,
  criarTurma as criarTurmaModel,
  deletarTurma as deletarTurmaModel,
  listarTurmasOrdenadas,
} from "../models/turmaModel.js";

/**
 * Lista turmas cadastradas.
 * @query {string} cursoId - Filtra turmas de um curso específico.
 */
export async function listarTurmas(req, res) {
  try {
    const { cursoId } = req.query;
    const turmas = await listarTurmasOrdenadas(cursoId);
    return res.json(turmas);
  } catch (error) {
    console.error("Erro ao listar turmas:", error);
    return res.status(500).json({ message: "Erro ao listar turmas." });
  }
}

/**
 * Busca os detalhes de uma turma específica pelo ID.
 * @param {Object} req - Parâmetros da requisição contendo o id.
 * @param {Object} res - Resposta com os dados da turma.
 */
export async function buscarTurma(req, res) {
  try {
    const { id } = req.params;
    const turma = await buscarTurmaPorId(id);
    if (!turma) {
      return res.status(404).json({ message: "Turma não encontrada." });
    }
    return res.json(turma);
  } catch (error) {
    console.error("Erro ao buscar turma:", error);
    return res.status(500).json({ message: "Erro ao buscar turma." });
  }
}

/**
 * Cria uma nova turma associada a um curso.
 * Implementa denormalização salvando nome/código do curso para otimizar leituras.
 * @param {Object} req - Dados da turma no corpo da requisição.
 * @param {Object} res - Resposta com a turma criada.
 */
export async function criarTurma(req, res) {
  try {
    const { nome, cursoId, horario, periodoInicio, periodoFinal } = req.body;
    if (!nome || !cursoId || !horario || !periodoInicio || !periodoFinal) {
      return res.status(400).json({ message: "Campos nome, cursoId, horario, periodoInicio e periodoFinal são obrigatórios." });
    }

    // Garantia de integridade referencial: verifica se o curso pai existe
    const curso = await buscarCursoPorId(cursoId);
    if (!curso) {
      return res.status(404).json({ message: "Curso não encontrado." });
    }

    // Denormalização: salvamos o nome e código do curso na turma para evitar joins excessivos em listagens
    const id = await criarTurmaModel({
      nome,
      cursoId,
      cursoNome: curso.nome,
      cursoCodigo: curso.codigo,
      horario,
      periodoInicio,
      periodoFinal,
      criadoEm: new Date().toISOString(),
    });

    return res.status(201).json({
      id,
      nome,
      cursoId,
      cursoNome: curso.nome,
      cursoCodigo: curso.codigo,
      horario,
      periodoInicio,
      periodoFinal,
    });
  } catch (error) {
    console.error("Erro ao criar turma:", error);
    return res.status(500).json({ message: "Erro ao criar turma." });
  }
}

/**
 * Atualiza as informações de uma turma.
 * Se o cursoId mudar, atualiza também os dados denormalizados do curso.
 * @param {Object} req - ID na URL e campos para atualizar no body.
 * @param {Object} res - Resposta com dados atualizados.
 */
export async function atualizarTurma(req, res) {
  try {
    const { id } = req.params;
    const { nome, cursoId, horario, periodoInicio, periodoFinal } = req.body;

    const turma = await buscarTurmaPorId(id);
    if (!turma) {
      return res.status(404).json({ message: "Turma não encontrada." });
    }

    const updateData = {};
    if (nome) updateData.nome = nome;
    if (horario) updateData.horario = horario;
    if (periodoInicio) updateData.periodoInicio = periodoInicio;
    if (periodoFinal) updateData.periodoFinal = periodoFinal;

    // Se o curso for alterado, precisamos buscar as novas informações do curso pai
    if (cursoId && cursoId !== turma.cursoId) {
      const curso = await buscarCursoPorId(cursoId);
      if (!curso) {
        return res.status(404).json({ message: "Curso não encontrado." });
      }
      updateData.cursoId = cursoId;
      updateData.cursoNome = curso.nome;
      updateData.cursoCodigo = curso.codigo;
    }

    updateData.atualizadoEm = new Date().toISOString();

    await atualizarTurmaModel(id, updateData);
    return res.json({ ...turma, ...updateData });
  } catch (error) {
    console.error("Erro ao atualizar turma:", error);
    return res.status(500).json({ message: "Erro ao atualizar turma." });
  }
}

/**
 * Exclui uma turma permanentemente.
 * @param {Object} req - ID da turma nos parâmetros.
 */
export async function deletarTurma(req, res) {
  try {
    const { id } = req.params;
    const turma = await buscarTurmaPorId(id);
    if (!turma) {
      return res.status(404).json({ message: "Turma não encontrada." });
    }

    await deletarTurmaModel(id);
    return res.json({ message: "Turma excluída com sucesso." });
  } catch (error) {
    console.error("Erro ao deletar turma:", error);
    return res.status(500).json({ message: "Erro ao deletar turma." });
  }
}
