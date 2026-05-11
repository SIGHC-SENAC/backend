import os from "os";
import path from "path";
import fs from "fs/promises";
import { bucket } from "../config/firebase.js";
import {
  criarCertificadoHorasComplementares,
  registrarUploadSuspeito,
} from "../models/certificadoModel.js";
import {
  validarCabecalhoPdf,
  validarTamanho,
  analisarPdfSuspeito,
} from "../services/pdfScanner.js";

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
