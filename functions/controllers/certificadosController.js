import os from "os";
import path from "path";
import fs from "fs/promises";
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
  const { uid, storagePath, nomeArquivo } = req.body;

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
