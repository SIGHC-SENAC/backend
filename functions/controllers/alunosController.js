import { auth_firebase } from "../config/firebase.js";
import { transporter } from "../config/nodemailer.js";
import { buscarCursoPorId } from "../models/cursoModel.js";
import { buscarTurmaPorId } from "../models/turmaModel.js";
import {
  atualizarUsuario,
  buscarUsuarioPorId,
  criarUsuarioComId,
  deletarUsuario,
  listarUsuariosPorRole,
} from "../models/usuarioModel.js";
import { notificarAlunoAlteracao } from "./notificacoesController.js";

function sameStringArray(a = [], b = []) {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

async function getCursosSelecionados(cursoIdBody, cursoIdsBody) {
  const ids = Array.from(new Set(
    (Array.isArray(cursoIdsBody) && cursoIdsBody.length ? cursoIdsBody : [cursoIdBody]).filter(Boolean)
  ));

  if (ids.length === 0) {
    return { error: { status: 400, message: "Informe ao menos um curso para o aluno." } };
  }

  const cursos = [];
  for (const id of ids) {
    const curso = await buscarCursoPorId(id);
    if (!curso) {
      return { error: { status: 404, message: `Curso nao encontrado: ${id}` } };
    }

    cursos.push({
      id,
      nome: curso.nome,
      codigo: curso.codigo,
      turno: curso.turno,
    });
  }

  return { ids, cursos, principal: cursos[0] };
}

async function getTurmasSelecionadas(turmaIdBody, turmaIdsBody, cursoIdsSelecionados = []) {
  const ids = Array.from(new Set(
    (Array.isArray(turmaIdsBody) ? turmaIdsBody : turmaIdBody ? [turmaIdBody] : []).filter(Boolean)
  ));

  const turmas = [];
  for (const id of ids) {
    const turma = await buscarTurmaPorId(id);
    if (!turma) {
      return { error: { status: 404, message: `Turma nao encontrada: ${id}` } };
    }

    if (cursoIdsSelecionados.length > 0 && !cursoIdsSelecionados.includes(turma.cursoId)) {
      return { error: { status: 400, message: "A turma selecionada nao pertence aos cursos escolhidos." } };
    }

    turmas.push({
      id,
      nome: turma.nome,
      cursoId: turma.cursoId,
      cursoNome: turma.cursoNome,
      cursoCodigo: turma.cursoCodigo,
      horario: turma.horario,
      periodoInicio: turma.periodoInicio,
      periodoFinal: turma.periodoFinal,
    });
  }

  return { ids, turmas, principal: turmas[0] || null };
}

/**
 * Lista alunos cadastrados, permitindo filtragem por curso.
 * @param {Object} req - Requisição com query param 'cursoId' opcional.
 * @param {Object} res - Array de alunos encontrados.
 * @returns {Promise<Object>}
 */
export async function listarAlunos(req, res) {
  try {
    const { cursoId } = req.query;
    let alunos = await listarUsuariosPorRole("aluno");
    if (cursoId) {
      alunos = alunos.filter((aluno) => aluno.cursoId === cursoId || aluno.cursoIds?.includes(cursoId));
    }
    return res.json(alunos);
  } catch (error) {
    console.error("Erro ao listar alunos:", error);
    return res.status(500).json({ message: "Erro ao listar alunos." });
  }
}

/**
 * Cadastra um novo aluno no sistema.
 * Valida curso/turma, cria conta no Auth, salva no Firestore e envia e-mail formatado.
 * @param {Object} req - Body com nome, email, cursoId e turmaId.
 * @param {Object} res - Status da criação.
 */
export async function criarAluno(req, res) {
  try {
    const { nome, email, cursoId: cursoIdBody, cursoIds, turmaId, turmaIds } = req.body;
    const cursosSelecionados = await getCursosSelecionados(cursoIdBody, cursoIds);
    if (cursosSelecionados.error) {
      return res.status(cursosSelecionados.error.status).json({ message: cursosSelecionados.error.message });
    }
    const cursoId = cursosSelecionados.ids[0];
    const cursoPrincipal = cursosSelecionados.principal;
    if (!nome || !email) {
      return res.status(400).json({ message: "Campos nome, email e cursoId são obrigatórios." });
    }

    const turmasSelecionadas = await getTurmasSelecionadas(turmaId, turmaIds, cursosSelecionados.ids);
    if (turmasSelecionadas.error) {
      return res.status(turmasSelecionadas.error.status).json({ message: turmasSelecionadas.error.message });
    }

    // Cria usuário no Firebase Auth
    const userRecord = await auth_firebase.createUser({
      email,
      displayName: nome,
      password: email.split("@")[0] + "2025!", // senha temporária
    });

    // Define custom claim de role
    await auth_firebase.setCustomUserClaims(userRecord.uid, { role: "aluno" });

    // Cria documento no Firestore
    const userData = {
      nome,
      email,
      role: "aluno",
      cursoId,
      cursoCodigo: cursoPrincipal.codigo,
      cursoNome: cursoPrincipal.nome,
      cursoIds: cursosSelecionados.ids,
      cursos: cursosSelecionados.cursos,
      createdAt: Date.now(),
      createdBy: "admin",
    };
    if (turmasSelecionadas.ids.length > 0) {
      userData.turmaId = turmasSelecionadas.ids[0];
      userData.turmaNome = turmasSelecionadas.principal.nome;
      userData.turmaIds = turmasSelecionadas.ids;
      userData.turmas = turmasSelecionadas.turmas;
    }

    await criarUsuarioComId(userRecord.uid, userData);

    const senhaTemporaria = email.split("@")[0] + "2025!";

// Disparo de e-mail transacional via Nodemailer
await transporter.sendMail({
  from: `"Horas Complementares - Senac" <${process.env.USER_GMAIL}>`,
  to: email,
  subject: "Bem-vindo ao Sistema de Horas Complementares - Senac",
  html: `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">
      
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 100%); padding: 32px 24px; text-align: center;">
        <img src="https://sighc.com.br/logo.png" alt="Senac Pernambuco" style="height: 56px; margin-bottom: 12px;" />
        <p style="color: rgba(255,255,255,0.85); font-size: 13px; margin: 0;">Sistema Acadêmico de Horas Complementares</p>
      </div>

      <!-- Body -->
      <div style="padding: 32px 28px;">
        <h2 style="color: #1e3a5f; font-size: 22px; margin: 0 0 8px;">Olá, ${nome}! 👋</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
          Sua conta foi criada com sucesso. Use as credenciais abaixo para acessar o sistema pela primeira vez.
        </p>

        <!-- Credentials Card -->
        <div style="background: #f1f5f9; border-left: 4px solid #1e3a5f; border-radius: 8px; padding: 20px; margin: 0 0 24px;">
          <p style="margin: 0 0 8px; color: #334155; font-size: 14px;">
            <strong>E-mail:</strong> ${email}
          </p>
          <p style="margin: 0; color: #334155; font-size: 14px;">
            <strong>Senha temporária:</strong> 
            <code style="background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 14px;">${senhaTemporaria}</code>
          </p>
        </div>

        <!-- Warning -->
        <div style="background: #fef3c7; border-radius: 8px; padding: 14px 16px; margin: 0 0 24px; display: flex; align-items: flex-start;">
          <span style="font-size: 18px; margin-right: 10px;">⚠️</span>
          <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5;">
            <strong>Importante:</strong> Redefina sua senha no primeiro acesso para garantir a segurança da sua conta.
          </p>
        </div>

        <!-- CTA Button -->
        <div style="text-align: center; margin: 0 0 8px;">
          <a href="https://sighc.com.br/first-access" 
             style="display: inline-block; background: linear-gradient(135deg, #1e3a5f, #2d5a8e); color: #ffffff; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
            Acessar o Sistema
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="background: #f8fafc; padding: 20px 28px; border-top: 1px solid #e2e8f0; text-align: center;">
        <p style="margin: 0 0 4px; font-size: 12px; color: #94a3b8;">Faculdade Senac Pernambuco</p>
        <p style="margin: 0; font-size: 11px; color: #cbd5e1;">Projeto Integrador 3º Período</p>
      </div>
    </div>
  `,
});


    return res.status(201).json({
      uid: userRecord.uid,
      nome,
      email,
      cursoId,
      cursoIds: cursosSelecionados.ids,
      cursos: cursosSelecionados.cursos,
      turmaIds: turmasSelecionadas.ids,
      turmas: turmasSelecionadas.turmas,
      message: "Aluno cadastrado com sucesso.",
    });
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      return res.status(409).json({ message: "Este e-mail já está cadastrado." });
    }
    console.error("Erro ao criar aluno:", error);
    return res.status(500).json({ message: "Erro ao cadastrar aluno." });
  }
}

/**
 * Atualiza os dados de um aluno.
 * Sincroniza as alterações no Firebase Auth e no Firestore, incluindo curso e turma.
 * @param {Object} req - Parâmetro 'id' na URL e dados no body.
 * @param {Object} res - Resposta com dados atualizados.
 */
export async function atualizarAluno(req, res) {
  try {
    const { id } = req.params;
    const { nome, email, cursoId: cursoIdBody, cursoIds, turmaId, turmaIds } = req.body;

    const alunoAtual = await buscarUsuarioPorId(id);
    if (!alunoAtual || alunoAtual.role !== "aluno") {
      return res.status(404).json({ message: "Aluno não encontrado." });
    }

    const updateData = {};
    const alteracoes = [];
    if (nome) {
      updateData.nome = nome;
      if (nome !== alunoAtual.nome) alteracoes.push("nome");
      await auth_firebase.updateUser(id, { displayName: nome });
    }
    if (email) {
      updateData.email = email;
      if (email !== alunoAtual.email) alteracoes.push("e-mail");
      await auth_firebase.updateUser(id, { email });
    }

    // Se os cursos forem enviados, atualiza as informacoes denormalizadas.
    if (cursoIdBody || Array.isArray(cursoIds)) {
      const cursosSelecionados = await getCursosSelecionados(cursoIdBody, cursoIds);
      if (cursosSelecionados.error) {
        return res.status(cursosSelecionados.error.status).json({ message: cursosSelecionados.error.message });
      }
      const cursoId = cursosSelecionados.ids[0];
      const cursoPrincipal = cursosSelecionados.principal;

      updateData.cursoId = cursoId;
      updateData.cursoCodigo = cursoPrincipal.codigo;
      updateData.cursoNome = cursoPrincipal.nome;
      updateData.cursoIds = cursosSelecionados.ids;
      updateData.cursos = cursosSelecionados.cursos;
      const cursosAtuais = alunoAtual.cursoIds || (alunoAtual.cursoId ? [alunoAtual.cursoId] : []);
      if (!sameStringArray(cursosSelecionados.ids, cursosAtuais)) alteracoes.push("cursos");
    }

    // Se as turmas forem enviadas, salva uma turma por curso selecionado.
    if (turmaId || Array.isArray(turmaIds)) {
      const cursoIdsParaValidar = Array.isArray(updateData.cursoIds)
        ? updateData.cursoIds
        : alunoAtual.cursoIds || (alunoAtual.cursoId ? [alunoAtual.cursoId] : []);
      const turmasSelecionadas = await getTurmasSelecionadas(turmaId, turmaIds, cursoIdsParaValidar);
      if (turmasSelecionadas.error) {
        return res.status(turmasSelecionadas.error.status).json({ message: turmasSelecionadas.error.message });
      }

      updateData.turmaIds = turmasSelecionadas.ids;
      updateData.turmas = turmasSelecionadas.turmas;
      updateData.turmaId = turmasSelecionadas.principal?.id || null;
      updateData.turmaNome = turmasSelecionadas.principal?.nome || null;
      const turmasAtuais = alunoAtual.turmaIds || (alunoAtual.turmaId ? [alunoAtual.turmaId] : []);
      if (!sameStringArray(turmasSelecionadas.ids, turmasAtuais)) alteracoes.push("turmas");
    }

    updateData.updatedAt = Date.now();

    await atualizarUsuario(id, updateData);
    if (alteracoes.length > 0) {
      await notificarAlunoAlteracao(id, alteracoes);
    }
    return res.json({ ...alunoAtual, ...updateData });
  } catch (error) {
    console.error("Erro ao atualizar aluno:", error);
    return res.status(500).json({ message: "Erro ao atualizar aluno." });
  }
}

/**
 * Remove um aluno permanentemente do Firebase Auth e do Firestore.
 * @param {Object} req - Parâmetro 'id' na URL.
 * @param {Object} res - Mensagem de sucesso ou erro.
 */
export async function deletarAluno(req, res) {
  try {
    const { id } = req.params;

    const aluno = await buscarUsuarioPorId(id);
    if (!aluno || aluno.role !== "aluno") {
      return res.status(404).json({ message: "Aluno não encontrado." });
    }

    // Remove do Auth e depois do Firestore
    await auth_firebase.deleteUser(id);
    await deletarUsuario(id);

    return res.json({ message: "Aluno excluído com sucesso." });
  } catch (error) {
    console.error("Erro ao deletar aluno:", error);
    return res.status(500).json({ message: "Erro ao deletar aluno." });
  }
}
