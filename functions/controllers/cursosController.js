import {
  atualizarCurso as atualizarCursoModel,
  buscarCursoPorId,
  criarCurso as criarCursoModel,
  deletarCurso as deletarCursoModel,
  existeCursoComCodigo,
  gerarCodigoCurso,
  listarCursosOrdenados,
} from "../models/cursoModel.js";

const CARGA_HORARIA_COMPLEMENTAR_PADRAO = 100;
const DEFAULT_REGRAS_ATIVIDADES = [
  {
    id: "ensino",
    label: "Atividades vinculadas ao ensino",
    tipo: "ensino",
    atividades: [
      { id: "1.1", descricao: "Participação em monitoria no curso", horasMaximas: 20, aproveitamentoMaximo: "20h por semestre", requisito: "Declaração da atividade", grupo: "ensino" },
      { id: "1.2", descricao: "Comparecimento à defesa de monografias, temas pertinentes", horasMaximas: 2, aproveitamentoMaximo: "2h por participação", requisito: "Relatório do evento e lista de presença", grupo: "ensino" },
      { id: "1.3", descricao: "Disciplina cursada em outro curso da Faculdade Senac", horasMaximas: 20, aproveitamentoMaximo: "20h por disciplina", requisito: "Histórico oficial", grupo: "ensino" },
      { id: "1.4", descricao: "Disciplina cursada fora da Faculdade Senac", horasMaximas: 20, aproveitamentoMaximo: "20h por disciplina", requisito: "Histórico escolar e o programa da disciplina", grupo: "ensino" },
      { id: "1.5", descricao: "Cursos instrumentais - informática e/ou língua estrangeira", horasMaximas: 10, aproveitamentoMaximo: "10h por semestre", requisito: "Declaração do curso e aprovação no módulo ou semestre", grupo: "ensino" },
      { id: "1.6", descricao: "Certificações reconhecidas da área", horasMaximas: 10, aproveitamentoMaximo: "10h por semestre", requisito: "Declaração de curso", grupo: "ensino" },
      { id: "1.7", descricao: "Elaboração de material didático supervisionado", horasMaximas: 5, aproveitamentoMaximo: "5h por material", requisito: "Cópia do material", grupo: "ensino" },
      { id: "1.8", descricao: "Professor participante da formação do aluno", horasMaximas: 10, aproveitamentoMaximo: "10h por participação", requisito: "Certificado de Participação", grupo: "ensino" },
      { id: "1.9", descricao: "Visitas técnicas", horasMaximas: 4, aproveitamentoMaximo: "4h por visita", requisito: "Documento do órgão/empresa e/ou comprovante de presença", grupo: "ensino" },
    ],
  },
  {
    id: "pesquisa",
    label: "Atividades vinculadas à pesquisa",
    tipo: "pesquisa",
    atividades: [
      { id: "2.1", descricao: "Participação em pesquisa ou atividades de pesquisa", horasMaximas: 10, aproveitamentoMaximo: "10h por produto final publicado", requisito: "Relatório do professor orientador", grupo: "pesquisa" },
      { id: "2.2", descricao: "Programa de bolsa de iniciação científica", horasMaximas: 20, aproveitamentoMaximo: "20h por semestre", requisito: "Relatório do professor orientador", grupo: "pesquisa" },
      { id: "2.3", descricao: "Publicações de artigos em revistas, periódicos, sites e congêneres", horasMaximas: 10, aproveitamentoMaximo: "10h por produto publicado", requisito: "Publicação", grupo: "pesquisa" },
      { id: "2.4", descricao: "Publicação em livro na área", horasMaximas: 40, aproveitamentoMaximo: "40h por produto publicado", requisito: "Livro publicado", grupo: "pesquisa" },
      { id: "2.5", descricao: "Participação em programa especial de treinamento", horasMaximas: 10, aproveitamentoMaximo: "10h por semestre", requisito: "Atestado ou certificado de participação", grupo: "pesquisa" },
    ],
  },
  {
    id: "extensao",
    label: "Atividades vinculadas à extensão",
    tipo: "extensão",
    atividades: [
      { id: "3.1", descricao: "Participação em seminários, congressos, conferências, encontros", horasMaximas: 10, aproveitamentoMaximo: "10h por participação / 4h como público", requisito: "Atestado ou certificado de participação", grupo: "extensao" },
      { id: "3.2", descricao: "Atendimento comunitário de cunho social", horasMaximas: 10, aproveitamentoMaximo: "10h por semestre", requisito: "Atestado de participação", grupo: "extensao" },
      { id: "3.3", descricao: "Apresentação de trabalhos, concursos, exposições, painéis, mostras etc.", horasMaximas: 10, aproveitamentoMaximo: "10h pela apresentação", requisito: "Trabalho apresentado", grupo: "extensao" },
      { id: "3.4", descricao: "Estágio extracurricular em entidades públicas ou privadas conveniadas com a Faculdade Senac", horasMaximas: 20, aproveitamentoMaximo: "20h por semestre", requisito: "Declaração da instituição apresentando relatório de atividades", grupo: "extensao" },
      { id: "3.5", descricao: "Participação em órgãos colegiados da Faculdade Senac", horasMaximas: 5, aproveitamentoMaximo: "5h por semestre", requisito: "Declaração da Direção ou Presidente dos Conselhos", grupo: "extensao" },
      { id: "3.6", descricao: "Representação estudantil", horasMaximas: 10, aproveitamentoMaximo: "10h por semestre", requisito: "Declaração da representação estudantil", grupo: "extensao" },
      { id: "3.7", descricao: "Cursos de extensão universitária dentro ou fora da Faculdade Senac", horasMaximas: 10, aproveitamentoMaximo: "10h por curso", requisito: "Declaração da instituição atestando carga horária", grupo: "extensao" },
    ],
  },
];

function cloneDefaultRegras() {
  return JSON.parse(JSON.stringify(DEFAULT_REGRAS_ATIVIDADES));
}

function validarRegrasAtividades(regrasAtividades) {
  if (!Array.isArray(regrasAtividades)) return false;
  return regrasAtividades.every((grupo) =>
    grupo &&
    typeof grupo.label === "string" &&
    Array.isArray(grupo.atividades) &&
    grupo.atividades.every((atividade) =>
      atividade &&
      typeof atividade.id === "string" &&
      typeof atividade.descricao === "string" &&
      Number.isInteger(atividade.horasMaximas) &&
      atividade.horasMaximas > 0 &&
      typeof atividade.requisito === "string"
    )
  );
}

/**
 * Retorna todos os cursos cadastrados ordenados por data de criação.
 * @returns {Promise<Object>} Lista de cursos.
 */
export async function listarCursos(req, res) {
  try {
    const cursos = await listarCursosOrdenados();
    return res.json(cursos);
  } catch (error) {
    console.error("Erro ao listar cursos:", error);
    return res.status(500).json({ message: "Erro ao listar cursos." });
  }
}

/**
 * Busca detalhes de um único curso pelo seu ID.
 * @param {Object} req - Parâmetro 'id' na URL.
 */
export async function buscarCurso(req, res) {
  try {
    const { id } = req.params;
    const curso = await buscarCursoPorId(id);
    if (!curso) {
      return res.status(404).json({ message: "Curso não encontrado." });
    }
    return res.json(curso);
  } catch (error) {
    console.error("Erro ao buscar curso:", error);
    return res.status(500).json({ message: "Erro ao buscar curso." });
  }
}

/**
 * Cria um novo curso.
 * Valida se o código do curso é único antes de salvar.
 * @param {Object} req - Body com nome, codigo e carga horária.
 */
export async function criarCurso(req, res) {
  try {
    const { nome, codigo: codigoBody, cargaHorariaComplementar, regrasAtividades } = req.body;
    const codigo = codigoBody || await gerarCodigoCurso();
    if (!nome) {
      return res.status(400).json({ message: "Campo nome é obrigatório." });
    }

    // Regra de negócio: O código do curso deve ser único no sistema
    if (await existeCursoComCodigo(codigo)) {
      return res.status(409).json({ message: "Já existe um curso com este código." });
    }

    if (regrasAtividades !== undefined && !validarRegrasAtividades(regrasAtividades)) {
      return res.status(400).json({ message: "regrasAtividades deve conter categorias e itens com horasMaximas inteiras." });
    }

    const carga = Number(cargaHorariaComplementar || CARGA_HORARIA_COMPLEMENTAR_PADRAO);
    const regras = regrasAtividades?.length ? regrasAtividades : cloneDefaultRegras();

    // Adiciona o novo curso com metadados de auditoria (criadoEm)
    const id = await criarCursoModel({
      nome,
      codigo,
      cargaHorariaComplementar: carga,
      regrasAtividades: regras,
      criadoEm: new Date().toISOString(),
    });

    return res.status(201).json({ id, nome, codigo, cargaHorariaComplementar: carga, regrasAtividades: regras });
  } catch (error) {
    console.error("Erro ao criar curso:", error);
    return res.status(500).json({ message: "Erro ao criar curso." });
  }
}

/**
 * Atualiza dados de um curso existente.
 * @param {Object} req - ID na URL e campos para atualizar no body.
 */
export async function atualizarCurso(req, res) {
  try {
    const { id } = req.params;
    const { nome, codigo, cargaHorariaComplementar, regrasAtividades } = req.body;

    // Obtém referência do documento para verificar existência antes de atualizar
    const curso = await buscarCursoPorId(id);
    if (!curso) {
      return res.status(404).json({ message: "Curso não encontrado." });
    }

    // Constrói objeto de atualização dinamicamente apenas com campos fornecidos
    const updateData = {};
    if (nome) updateData.nome = nome;
    if (codigo) updateData.codigo = codigo;
    if (cargaHorariaComplementar) updateData.cargaHorariaComplementar = Number(cargaHorariaComplementar);
    if (regrasAtividades !== undefined) {
      if (!validarRegrasAtividades(regrasAtividades)) {
        return res.status(400).json({ message: "regrasAtividades deve conter categorias e itens com horasMaximas inteiras." });
      }
      updateData.regrasAtividades = regrasAtividades;
    }
    updateData.atualizadoEm = new Date().toISOString();

    // Executa a atualização parcial no Firestore
    await atualizarCursoModel(id, updateData);
    return res.json({ ...curso, ...updateData });
  } catch (error) {
    console.error("Erro ao atualizar curso:", error);
    return res.status(500).json({ message: "Erro ao atualizar curso." });
  }
}

/**
 * Exclui um curso do Firestore.
 * @param {Object} req - ID do curso.
 */
export async function deletarCurso(req, res) {
  try {
    const { id } = req.params;
    const curso = await buscarCursoPorId(id);
    if (!curso) {
      return res.status(404).json({ message: "Curso não encontrado." });
    }

    await deletarCursoModel(id);
    return res.json({ message: "Curso excluído com sucesso." });
  } catch (error) {
    console.error("Erro ao deletar curso:", error);
    return res.status(500).json({ message: "Erro ao deletar curso." });
  }
}
