import { db, auth_firebase } from "../config/firebase.js";
import { transporter } from "../config/nodemailer.js";

/**
 * Lista alunos cadastrados, permitindo filtragem por curso.
 * @param {Object} req - Requisição com query param 'cursoId' opcional.
 * @param {Object} res - Array de alunos encontrados.
 * @returns {Promise<Object>}
 */
export async function listarAlunos(req, res) {
  try {
    const { cursoId } = req.query;
    const snapshot = await db.collection("users").where("role", "==", "aluno").get();
    let alunos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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
    const { nome, email, cursoId: cursoIdBody, cursoIds, turmaId } = req.body;
    const cursoId = cursoIdBody || cursoIds?.[0];
    if (!nome || !email) {
      return res.status(400).json({ message: "Campos nome, email e cursoId são obrigatórios." });
    }

    if (!cursoId) {
      return res.status(400).json({ message: "Informe ao menos um curso para o aluno." });
    }

    // Verifica se o curso existe
    const cursoDoc = await db.collection("cursos").doc(cursoId).get();
    if (!cursoDoc.exists) {
      return res.status(404).json({ message: "Curso não encontrado." });
    }

    // Verifica turma se informada
    let turmaNome = null;
    if (turmaId) {
      const turmaDoc = await db.collection("turmas").doc(turmaId).get();
      if (!turmaDoc.exists) {
        return res.status(404).json({ message: "Turma não encontrada." });
      }
      turmaNome = turmaDoc.data().nome;
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
      cursoCodigo: cursoDoc.data().codigo,
      cursoNome: cursoDoc.data().nome,
      cursoIds: Array.isArray(cursoIds) && cursoIds.length ? cursoIds : [cursoId],
      createdAt: Date.now(),
      createdBy: "admin",
    };
    if (turmaId) {
      userData.turmaId = turmaId;
      userData.turmaNome = turmaNome;
    }

    await db.collection("users").doc(userRecord.uid).set(userData);

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
    const { nome, email, cursoId, turmaId } = req.body;

    const docRef = db.collection("users").doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().role !== "aluno") {
      return res.status(404).json({ message: "Aluno não encontrado." });
    }

    const updateData = {};
    if (nome) {
      updateData.nome = nome;
      await auth_firebase.updateUser(id, { displayName: nome });
    }
    if (email) {
      updateData.email = email;
      await auth_firebase.updateUser(id, { email });
    }

    // Se o curso mudar, atualiza as informações denormalizadas
    if (cursoId && cursoId !== doc.data().cursoId) {
      const cursoDoc = await db.collection("cursos").doc(cursoId).get();
      if (!cursoDoc.exists) {
        return res.status(404).json({ message: "Curso não encontrado." });
      }
      updateData.cursoId = cursoId;
      updateData.cursoCodigo = cursoDoc.data().codigo;
      updateData.cursoNome = cursoDoc.data().nome;
    }

    // Se a turma mudar, busca o novo nome da turma
    if (turmaId && turmaId !== doc.data().turmaId) {
      const turmaDoc = await db.collection("turmas").doc(turmaId).get();
      if (!turmaDoc.exists) {
        return res.status(404).json({ message: "Turma não encontrada." });
      }
      updateData.turmaId = turmaId;
      updateData.turmaNome = turmaDoc.data().nome;
    }

    updateData.updatedAt = Date.now();

    await docRef.update(updateData);
    return res.json({ id, ...doc.data(), ...updateData });
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

    const docRef = db.collection("users").doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().role !== "aluno") {
      return res.status(404).json({ message: "Aluno não encontrado." });
    }

    // Remove do Auth e depois do Firestore
    await auth_firebase.deleteUser(id);
    await docRef.delete();

    return res.json({ message: "Aluno excluído com sucesso." });
  } catch (error) {
    console.error("Erro ao deletar aluno:", error);
    return res.status(500).json({ message: "Erro ao deletar aluno." });
  }
}
