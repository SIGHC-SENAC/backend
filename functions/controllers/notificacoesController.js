import { admin } from "../config/firebase.js";
import { createBatch } from "../models/firebaseModel.js";
import { listarDocsUsuariosPorRole, usuarioRef } from "../models/usuarioModel.js";

function coletarTokensAtivos(data) {
  const tokens = [];

  if (Array.isArray(data.fcmTokens)) {
    data.fcmTokens
      .filter((item) => item.active && item.token)
      .forEach((item) => tokens.push(item.token));
  } else if (data.fcmToken) {
    tokens.push(data.fcmToken);
  }

  return [...new Set(tokens)];
}

async function limparTokensInvalidos(docRef, data, invalidTokens) {
  if (!invalidTokens.length || !Array.isArray(data.fcmTokens)) return;

  const filtered = data.fcmTokens.filter((item) => !invalidTokens.includes(item.token));
  await docRef.update({ fcmTokens: filtered });
}

export async function notificarAlunoAlteracao(alunoId, alteracoes = []) {
  try {
    const alunoRef = usuarioRef(alunoId);
    const alunoDoc = await alunoRef.get();

    if (!alunoDoc.exists) {
      return { success: true, sent: 0, message: "Aluno nao encontrado" };
    }

    const alunoData = alunoDoc.data();
    const tokens = coletarTokensAtivos(alunoData);

    if (tokens.length === 0) {
      return { success: true, sent: 0, message: "Aluno sem token FCM" };
    }

    const campos = alteracoes.length ? alteracoes.join(", ") : "dados do cadastro";
    const message = {
      notification: {
        title: "Cadastro atualizado",
        body: `Seu cadastro foi atualizado: ${campos}.`,
      },
      data: {
        type: "aluno_atualizado",
        alunoId,
        alteracoes: alteracoes.join(","),
        timestamp: Date.now().toString(),
      },
    };

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      ...message,
    });

    const invalidTokens = [];
    response.responses.forEach((result, index) => {
      if (!result.success && ["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(result.error?.code)) {
        invalidTokens.push(tokens[index]);
      }
    });

    await limparTokensInvalidos(alunoRef, alunoData, invalidTokens);

    return {
      success: true,
      sent: response.successCount,
      failed: response.failureCount,
    };
  } catch (error) {
    console.error("Erro ao notificar aluno sobre alteracao:", error);
    return { success: false, sent: 0, error: error.message };
  }
}

export async function notificarAlunoCertificadoAnalisado(req, res) {
  try {
    const { alunoId, certificadoId, status, nomeArquivo, horasAprovadas, motivoRejeicao } = req.body;

    if (!alunoId || !certificadoId || !status) {
      return res.status(400).json({ error: "alunoId, certificadoId e status sao obrigatorios" });
    }

    if (!["aprovado", "rejeitado"].includes(status)) {
      return res.status(400).json({ error: "Status invalido para notificacao" });
    }

    const alunoRef = usuarioRef(alunoId);
    const alunoDoc = await alunoRef.get();

    if (!alunoDoc.exists) {
      return res.json({ success: true, sent: 0, message: "Aluno nao encontrado" });
    }

    const alunoData = alunoDoc.data();
    const tokens = coletarTokensAtivos(alunoData);

    if (tokens.length === 0) {
      return res.json({ success: true, sent: 0, message: "Aluno sem token FCM" });
    }

    const aprovado = status === "aprovado";
    const message = {
      notification: {
        title: aprovado ? "Certificado aprovado" : "Certificado nao aprovado",
        body: aprovado
          ? `Seu certificado${nomeArquivo ? ` "${nomeArquivo}"` : ""} foi aprovado${horasAprovadas ? ` com ${horasAprovadas}h` : ""}.`
          : `Seu certificado${nomeArquivo ? ` "${nomeArquivo}"` : ""} foi rejeitado${motivoRejeicao ? `: ${motivoRejeicao}` : "."}`,
      },
      data: {
        type: "certificado_analisado",
        alunoId,
        certificadoId,
        status,
        nomeArquivo: nomeArquivo || "",
        timestamp: Date.now().toString(),
      },
    };

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      ...message,
    });

    const invalidTokens = [];
    response.responses.forEach((result, index) => {
      if (!result.success && ["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(result.error?.code)) {
        invalidTokens.push(tokens[index]);
      }
    });

    await limparTokensInvalidos(alunoRef, alunoData, invalidTokens);

    return res.json({
      success: true,
      sent: response.successCount,
      failed: response.failureCount,
    });
  } catch (error) {
    console.error("Erro ao notificar aluno sobre certificado analisado:", error);
    return res.status(500).json({ error: "Erro interno ao enviar notificacao ao aluno" });
  }
}

/**
 * Notifica administradores sobre novos uploads via Push (FCM).
 * Envia para todos os tokens ativos e limpa automaticamente tokens expirados.
 * 
 * @param {Object} req - Body com nomeAluno e nomeArquivo.
 */
export async function notificarAdminsUpload(req, res) {
  try {
    const { nomeAluno, nomeArquivo } = req.body;

    if (!nomeAluno || !nomeArquivo) {
      return res.status(400).json({ error: "nomeAluno e nomeArquivo são obrigatórios" });
    }

    // Busca todos os admins
    const adminsSnap = await listarDocsUsuariosPorRole("admin");

    // Coleta tokens FCM ativos de todos os admins
    let tokens = [];
    adminsSnap.forEach((doc) => {
      const data = doc.data();
      tokens = [...tokens, ...coletarTokensAtivos(data)];
    });

    if (tokens.length === 0) {
      return res.json({ success: true, sent: 0, message: "Nenhum admin com token FCM" });
    }

    // Remove duplicatas
    const uniqueTokens = [...new Set(tokens)];

    // Define o payload da notificação push e os dados de contexto (data)
    const message = {
      notification: {
        title: "📄 Novo certificado enviado",
        body: `${nomeAluno} enviou o arquivo "${nomeArquivo}"`,
      },
      data: {
        type: "novo_certificado",
        nomeAluno,
        nomeArquivo,
        timestamp: Date.now().toString(),
      },
    };

    // Envio multicast para múltiplos dispositivos simultaneamente
    const response = await admin.messaging().sendEachForMulticast({
      tokens: uniqueTokens,
      ...message,
    });

    // Manutenção de banco: identifica tokens que não são mais válidos (App desinstalado, etc)
    const invalidTokens = [];
    response.responses.forEach((r, i) => {
      if (!r.success && ["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(r.error?.code)) {
        invalidTokens.push(uniqueTokens[i]);
      }
    });

    if (invalidTokens.length > 0) {
      // Limpeza atômica via Batch de tokens que não existem mais ou foram desinstalados
      const batch = createBatch();
      adminsSnap.forEach((doc) => {
        const data = doc.data();
        if (Array.isArray(data.fcmTokens)) {
          const filtered = data.fcmTokens.filter((t) => !invalidTokens.includes(t.token));
          batch.update(doc.ref, { fcmTokens: filtered });
        }
      });
      await batch.commit();
    }

    return res.json({
      success: true,
      sent: response.successCount,
      failed: response.failureCount,
    });
  } catch (error) {
    console.error("Erro ao notificar admins:", error);
    return res.status(500).json({ error: "Erro interno ao enviar notificações" });
  }
}
