import os from "os";
import path from "path";
import fs from "fs/promises";
import { google } from "googleapis";
import { db, bucket } from "../config/firebase.js";
import {
  criarCertificadoHorasComplementares,
  registrarUploadSuspeito,
} from "../models/certificadoModel.js";
import {
  validarCabecalhoPdf,
  validarTamanho,
  analisarPdfSuspeito,
} from "../services/pdfScanner.js";

const CERT_COLLECTION = "certificados_horas_complementares";

export async function statsCertificados(req, res) {
  const { cursoId } = req.query;
  try {
    const count = async (status) => {
      let q = db.collection(CERT_COLLECTION);
      if (cursoId) q = q.where("cursoId", "==", cursoId);
      if (status)  q = q.where("status", "==", status);
      return (await q.count().get()).data().count;
    };
    const [total, pendentes, aprovados, rejeitados] = await Promise.all([
      count(null), count("pendente"), count("aprovado"), count("rejeitado"),
    ]);
    return res.json({ total, pendentes, aprovados, rejeitados });
  } catch (error) {
    console.error("Erro ao calcular stats:", error);
    return res.status(500).json({ message: "Erro ao calcular estatísticas." });
  }
}

export async function listarCertificados(req, res) {
  const {
    uid,
    cursoId,
    turmaId,
    status,
    limit: limitParam = "15",
    startAfterId,
    sortField = "createdAt",
    sortDir = "desc",
  } = req.query;

  const pageSize = Math.min(parseInt(limitParam) || 15, 50);

  try {
    // Filtro por turma: busca UIDs dos alunos da turma e retorna todos os certs deles
    if (turmaId) {
      const usersSnap = await db.collection("users").where("turmaId", "==", turmaId).get();
      const turmaUids = usersSnap.docs.map((d) => d.id).filter(Boolean);

      if (turmaUids.length === 0) {
        return res.json({ certs: [], lastId: null, hasMore: false });
      }

      // Firestore 'in' suporta até 10 valores por query; divide em batches
      const batches = [];
      for (let i = 0; i < turmaUids.length; i += 10) {
        batches.push(turmaUids.slice(i, i + 10));
      }

      const batchSnaps = await Promise.all(batches.map((batch) => {
        let bq = db.collection(CERT_COLLECTION).where("uid", "in", batch);
        if (status && status !== "todos") bq = bq.where("status", "==", status);
        return bq.get();
      }));

      let allDocs = batchSnaps.flatMap((snap) => snap.docs);

      // Ordena em memória pois misturamos resultados de múltiplas queries
      const toNum = (v) => (typeof v === "number" ? v : v?.seconds ? v.seconds * 1000 : 0);
      allDocs.sort((a, b) => {
        const av = toNum(a.data()[sortField]);
        const bv = toNum(b.data()[sortField]);
        return sortDir === "desc" ? bv - av : av - bv;
      });

      const uids = [...new Set(allDocs.map((d) => d.data().uid).filter(Boolean))];
      const userMap = new Map();
      if (uids.length > 0) {
        const userSnaps = await db.getAll(...uids.map((id) => db.collection("users").doc(id)));
        userSnaps.forEach((d) => { if (d.exists) userMap.set(d.id, d.data()); });
      }

      const certs = allDocs.map((d) => {
        const data = d.data();
        const user = userMap.get(data.uid);
        return {
          id: d.id,
          ...data,
          nomeAluno:  data.nomeAluno  || user?.nome  || "Aluno não identificado",
          emailAluno: data.emailAluno || user?.email || "",
        };
      });

      return res.json({ certs, lastId: null, hasMore: false });
    }

    // Fluxo padrão com paginação por cursor
    let q = db.collection(CERT_COLLECTION);
    if (uid)                          q = q.where("uid", "==", uid);
    if (status && status !== "todos") q = q.where("status", "==", status);
    if (cursoId)                      q = q.where("cursoId", "==", cursoId);

    let cursorSnap = null;
    if (startAfterId) {
      cursorSnap = await db.collection(CERT_COLLECTION).doc(startAfterId).get();
    }

    let snapshot;
    try {
      let qOrdered = q.orderBy(sortField, sortDir).limit(pageSize + 1);
      if (cursorSnap?.exists) qOrdered = qOrdered.startAfter(cursorSnap);
      snapshot = await qOrdered.get();
    } catch {
      snapshot = await q.limit(pageSize + 1).get();
    }

    const hasMore = snapshot.docs.length > pageSize;
    const docs    = snapshot.docs.slice(0, pageSize);

    const uids = [...new Set(docs.map((d) => d.data().uid).filter(Boolean))];
    const userMap = new Map();
    if (uids.length > 0) {
      const userSnaps = await db.getAll(...uids.map((id) => db.collection("users").doc(id)));
      userSnaps.forEach((d) => { if (d.exists) userMap.set(d.id, d.data()); });
    }

    const certs = docs.map((d) => {
      const data = d.data();
      const user = userMap.get(data.uid);
      return {
        id: d.id,
        ...data,
        nomeAluno:  data.nomeAluno  || user?.nome  || "Aluno não identificado",
        emailAluno: data.emailAluno || user?.email || "",
      };
    });

    return res.json({ certs, lastId: docs.length > 0 ? docs[docs.length - 1].id : null, hasMore });
  } catch (error) {
    console.error("Erro ao listar certificados:", error);
    return res.status(500).json({ message: "Erro ao listar certificados." });
  }
}

/**
 * Processa um certificado recém-enviado para o Cloud Storage.
 * Realiza scan de segurança, move o arquivo se aprovado ou remove se suspeito.
 * 
 * @param {Object} req - Body contendo uid, storagePath e nomeArquivo.
 * @returns {Promise<Object>} Resposta JSON com o status do processamento.
 */
export async function processarCertificado(req, res) {
  const {
    uid, storagePath, nomeArquivo,
    categoriaId, categoriaNome,
    cursoId, cursoNome, cursoCodigo,
    nomeAluno, emailAluno, observacaoAluno,
  } = req.body;

  if (!uid || !storagePath || !nomeArquivo) {
    return res.status(400).json({
      error: "uid, storagePath e nomeArquivo são obrigatórios",
    });
  }

  let tempFilePath = null;

  try {
    const fileName = path.basename(storagePath);
    // Define caminho temporário no SO para análise (Cloud Functions têm diretório /tmp gravável)
    tempFilePath = path.join(os.tmpdir(), `${Date.now()}-${fileName}`);

    // Faz o download do arquivo do bucket para análise local no servidor
    await bucket.file(storagePath).download({ destination: tempFilePath });

    // 1. Validação de Tamanho: Previne ataques de negação de serviço (DoS) por arquivos gigantes
    const tamanhoOk = await validarTamanho(tempFilePath);
    if (!tamanhoOk) {
      await bucket.file(storagePath).delete({ ignoreNotFound: true });

      await registrarUploadSuspeito({
        uid,
        nomeArquivo,
        storagePath,
        motivo: "Arquivo acima do limite permitido",
        createdAt: Date.now(),
      });

      return res.status(400).json({
        error: "Arquivo acima do limite permitido",
      });
    }

    // 2. Validação de Cabeçalho: Garante que a extensão .pdf corresponde ao conteúdo (Magic Bytes)
    const cabecalhoOk = await validarCabecalhoPdf(tempFilePath);
    if (!cabecalhoOk) {
      await bucket.file(storagePath).delete({ ignoreNotFound: true });

      await registrarUploadSuspeito({
        uid,
        nomeArquivo,
        storagePath,
        motivo: "Arquivo não é um PDF válido",
        createdAt: Date.now(),
      });

      return res.status(400).json({
        error: "Arquivo inválido",
      });
    }

    // 3. Análise de Segurança: Varre o binário em busca de scripts (/JS, /JavaScript, etc.)
    const analise = await analisarPdfSuspeito(tempFilePath);
    if (analise.suspeito) {
      await bucket.file(storagePath).delete({ ignoreNotFound: true });

      await registrarUploadSuspeito({
        uid,
        nomeArquivo,
        storagePath,
        motivo: `Estruturas suspeitas: ${analise.encontrados.join(", ")}`,
        createdAt: Date.now(),
      });

      return res.status(400).json({
        error: "PDF rejeitado por segurança",
        encontrados: analise.encontrados,
      });
    }

    // Se aprovado, move o arquivo da pasta temporária para a definitiva no Storage
    const finalPath = storagePath.replace("certificados_temp/", "certificados/");
    await bucket.file(storagePath).move(finalPath);

    // Cria o registro oficial no Firestore
    await criarCertificadoHorasComplementares({
      uid,
      nomeArquivo,
      nomeAluno: nomeAluno || "",
      emailAluno: emailAluno || "",
      observacaoAluno: observacaoAluno || "",
      categoriaId: categoriaId || null,
      categoriaNome: categoriaNome || null,
      cursoId: cursoId || null,
      cursoNome: cursoNome || null,
      cursoCodigo: cursoCodigo || null,
      storagePath: finalPath,
      status: "pendente",
      analiseSeguranca: "aprovado",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return res.json({
      ok: true,
      message: "Arquivo analisado e aprovado",
      finalPath,
    });
  } catch (error) {
    console.error("Erro ao processar certificado:", error);
    return res.status(500).json({
      error: "Erro ao analisar certificado",
    });
  } finally {
    // Limpeza crucial: remove o arquivo do diretório temporário do SO após o processamento
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch {}
    }
  }
}

/**
 * Analisa o texto OCR de um certificado via Gemini 2.5 Flash e sugere a categoria de atividade.
 *
 * @param {Object} req - Body: { ocrText, regrasAtividades }
 * @returns {Promise<Object>} JSON com { grupoId, categoriaId } sugeridos.
 */
export async function analisarComIA(req, res) {
  const { ocrText, regrasAtividades } = req.body;

  if (!ocrText || !Array.isArray(regrasAtividades) || regrasAtividades.length === 0) {
    return res.status(400).json({ error: "ocrText e regrasAtividades são obrigatórios" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "Análise com IA não configurada" });
  }

  // Flatten to a minimal list to keep the prompt concise
  const atividadesList = regrasAtividades.flatMap((grupo) =>
    (grupo.atividades || []).map((ativ) => ({
      grupoId: grupo.id,
      grupoLabel: grupo.label,
      categoriaId: ativ.id,
      descricao: ativ.descricao,
    }))
  );

  const prompt = `Você é um classificador de certificados de horas complementares universitárias.

Analise o texto do certificado abaixo e escolha a categoria mais adequada da lista.

TEXTO DO CERTIFICADO:
---
${ocrText.slice(0, 3000)}
---

CATEGORIAS DISPONÍVEIS:
${JSON.stringify(atividadesList, null, 2)}

Responda SOMENTE com JSON válido neste exato formato (sem markdown, sem explicações):
{"grupoId":"<id do grupo>","categoriaId":"<id da categoria>"}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      console.error("Gemini API error:", JSON.stringify(err));
      const detail = err?.error?.message || err?.error?.status || geminiRes.status;
      return res.status(500).json({ error: "Erro na API Gemini", detail });
    }

    const data = await geminiRes.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.json({ grupoId: null, categoriaId: null });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate that the returned IDs actually exist in regrasAtividades
    const grupo = regrasAtividades.find((g) => g.id === parsed.grupoId);
    if (!grupo) return res.json({ grupoId: null, categoriaId: null });

    const atividade = (grupo.atividades || []).find((a) => a.id === parsed.categoriaId);
    if (!atividade) return res.json({ grupoId: parsed.grupoId, categoriaId: null });

    return res.json({ grupoId: parsed.grupoId, categoriaId: parsed.categoriaId });
  } catch (error) {
    console.error("Erro ao analisar com IA:", error);
    return res.status(500).json({ error: "Erro ao processar análise com IA" });
  }
}

/**
 * Executa OCR em um PDF armazenado no Cloud Storage via Google Cloud Vision API.
 * O arquivo deve estar em certificados_temp/ (ainda não processado).
 *
 * @param {Object} req - Body: { storagePath }
 * @returns {Promise<Object>} JSON com { text } extraído do documento.
 */
export async function extrairTextoOcr(req, res) {
  const { storagePath } = req.body;

  if (!storagePath) {
    return res.status(400).json({ error: "storagePath é obrigatório" });
  }

  if (!storagePath.startsWith("certificados_temp/")) {
    return res.status(400).json({ error: "caminho inválido" });
  }

  try {
    const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
    if (!b64) throw new Error("Credenciais do serviço não configuradas");

    const serviceAccount = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));

    const authClient = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });

    const tokenResponse = await authClient.getAccessToken();
    const accessToken = tokenResponse.token;

    const gcsUri = `gs://${bucket.name}/${storagePath}`;

    const visionRes = await fetch("https://vision.googleapis.com/v1/files:annotate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            inputConfig: {
              gcsSource: { uri: gcsUri },
              mimeType: "application/pdf",
            },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          },
        ],
      }),
    });

    if (!visionRes.ok) {
      const errData = await visionRes.json().catch(() => ({}));
      console.error("Vision API HTTP error:", JSON.stringify(errData));
      return res.status(500).json({ error: "Erro na API de OCR" });
    }

    const data = await visionRes.json();

    // A Vision API pode retornar HTTP 200 com erro embutido no corpo
    const embeddedError = data.responses?.[0]?.error;
    if (embeddedError) {
      console.error("Vision API embedded error:", JSON.stringify(embeddedError));
      return res.status(500).json({ error: "Erro ao processar documento no OCR" });
    }

    const text = (data.responses?.[0]?.responses ?? [])
      .map((r) => r.fullTextAnnotation?.text || "")
      .filter(Boolean)
      .join("\n")
      .trim();

    return res.json({ text });
  } catch (error) {
    console.error("Erro ao executar OCR:", error);
    return res.status(500).json({ error: "Erro ao processar OCR" });
  }
}
