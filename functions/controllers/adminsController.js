import { db, auth_firebase } from "../config/firebase.js";
import { transporter } from "../config/nodemailer.js";

async function montarVinculosCursos(cursoIds, cursoId) {
  const ids = Array.isArray(cursoIds) ? cursoIds : cursoId ? [cursoId] : [];
  const uniqueIds = [...new Set(ids.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))];

  if (uniqueIds.length === 0) {
    return { error: { status: 400, message: "Informe ao menos um curso para o coordenador." } };
  }

  const cursoDocs = await Promise.all(uniqueIds.map((id) => db.collection("cursos").doc(id).get()));
  const missingCurso = cursoDocs.find((doc) => !doc.exists);
  if (missingCurso) {
    return { error: { status: 404, message: "Curso nao encontrado." } };
  }

  const cursos = cursoDocs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      nome: data.nome,
      codigo: data.codigo || null,
      turno: data.turno || null,
    };
  });

  const cursoPrincipal = cursos[0];
  return {
    data: {
      cursoId: cursoPrincipal.id,
      cursoNome: cursoPrincipal.nome,
      cursoCodigo: cursoPrincipal.codigo,
      cursoIds: uniqueIds,
      cursos,
    },
  };
}

/**
 * Lista todos os usuários com papel de administrador ("admin").
 * @param {Object} req - Objeto de requisição Express.
 * @param {Object} res - Objeto de resposta Express.
 * @returns {Promise<Object>} JSON contendo a lista de administradores.
 */
export async function listarAdmins(req, res) {
  try {
    const snapshot = await db.collection("users").where("role", "==", "admin").get();
    const admins = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json(admins);
  } catch (error) {
    console.error("Erro ao listar admins:", error);
    return res.status(500).json({ message: "Erro ao listar admins." });
  }
}

/**
 * Cria um novo administrador.
 * Registra no Firebase Auth, define Custom Claims de role e envia e-mail de boas-vindas.
 * @param {Object} req - Requisição contendo 'nome' e 'email' no body.
 * @param {Object} res - Resposta da operação.
 * @returns {Promise<Object>} Dados do admin criado ou erro.
 */
export async function criarAdmin(req, res) {
  try {
    const { nome, email, cursoId, cursoIds } = req.body;
    if (!nome || !email) {
      return res.status(400).json({ message: "Campos nome e email são obrigatórios." });
    }

    // Estratégia de senha inicial: e-mail + sufixo (deve ser trocada no primeiro acesso)
    const vinculosCursos = await montarVinculosCursos(cursoIds, cursoId);
    if (vinculosCursos.error) {
      return res.status(vinculosCursos.error.status).json({ message: vinculosCursos.error.message });
    }

    const senhaTemporaria = email.split("@")[0] + "2025!";

    // Criação no Firebase Authentication (Identidade)
    const userRecord = await auth_firebase.createUser({
      email,
      displayName: nome,
      password: senhaTemporaria,
    });

    // Define privilégios de acesso via Custom Claims (segurança em nível de token JWT)
    await auth_firebase.setCustomUserClaims(userRecord.uid, { role: "admin" });

    // Persistência do perfil estendido no Firestore
    await db.collection("users").doc(userRecord.uid).set({
      nome,
      email,
      role: "admin",
      ...vinculosCursos.data,
      createdAt: Date.now(),
      createdBy: req.user.uid,
    });

    // Enviar e-mail com credenciais temporárias
    try {
      await transporter.sendMail({
        from: `"SIGHC - Senac" <${process.env.USER_GMAIL}>`,
        to: email,
        subject: "Suas credenciais de acesso ao SIGHC",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
            <h2 style="color: #003366;">Bem-vindo ao SIGHC</h2>
            <p>Olá <strong>${nome}</strong>,</p>
            <p>Sua conta de administrador foi criada com sucesso. Use as credenciais abaixo para acessar o sistema:</p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>E-mail:</strong> ${email}</p>
              <p style="margin: 4px 0;"><strong>Senha temporária:</strong> ${senhaTemporaria}</p>
            </div>
            <p style="color: #ef4444; font-size: 14px;">⚠️ Recomendamos que altere sua senha no primeiro acesso.</p>
            <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">Faculdade Senac Pernambuco</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Erro ao enviar e-mail:", emailError);
    }

    return res.status(201).json({
      uid: userRecord.uid,
      nome,
      email,
      ...vinculosCursos.data,
      message: "Admin cadastrado com sucesso.",
    });
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      return res.status(409).json({ message: "Este e-mail já está cadastrado." });
    }
    console.error("Erro ao criar admin:", error);
    return res.status(500).json({ message: "Erro ao cadastrar admin." });
  }
}

/**
 * Atualiza nome ou e-mail de um administrador.
 * Sincroniza as alterações no Firebase Auth e no Firestore.
 * @param {Object} req - Parâmetro 'id' na URL e dados no body.
 * @param {Object} res - Resposta com dados atualizados.
 */
export async function atualizarAdmin(req, res) {
  try {
    const { id } = req.params;
    const { nome, email, cursoId, cursoIds } = req.body;

    const docRef = db.collection("users").doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().role !== "admin") {
      return res.status(404).json({ message: "Admin não encontrado." });
    }

    if (req.body.email !== undefined && req.body.email !== doc.data().email) {
      return res.status(400).json({ message: "O e-mail do coordenador nao pode ser alterado." });
    }

    const updateData = {};
    if (nome) {
      updateData.nome = nome;
      await auth_firebase.updateUser(id, { displayName: nome });
    }
    if (cursoIds !== undefined || cursoId !== undefined) {
      const vinculosCursos = await montarVinculosCursos(cursoIds, cursoId);
      if (vinculosCursos.error) {
        return res.status(vinculosCursos.error.status).json({ message: vinculosCursos.error.message });
      }
      Object.assign(updateData, vinculosCursos.data);
    }

    updateData.atualizadoEm = new Date().toISOString();

    await docRef.update(updateData);
    return res.json({ id, ...doc.data(), ...updateData });
  } catch (error) {
    console.error("Erro ao atualizar admin:", error);
    return res.status(500).json({ message: "Erro ao atualizar admin." });
  }
}

/**
 * Remove um administrador permanentemente do Firebase Auth e do Firestore.
 * @param {Object} req - Parâmetro 'id' na URL.
 * @param {Object} res - Mensagem de sucesso ou erro.
 */
export async function deletarAdmin(req, res) {
  try {
    const { id } = req.params;

    const docRef = db.collection("users").doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().role !== "admin") {
      return res.status(404).json({ message: "Admin não encontrado." });
    }

    await auth_firebase.deleteUser(id);
    await docRef.delete();

    return res.json({ message: "Admin excluído com sucesso." });
  } catch (error) {
    console.error("Erro ao deletar admin:", error);
    return res.status(500).json({ message: "Erro ao deletar admin." });
  }
}
