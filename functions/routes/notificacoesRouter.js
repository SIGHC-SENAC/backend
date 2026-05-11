import express from "express";
import { notificarAdminsUpload, notificarAlunoCertificadoAnalisado } from "../controllers/notificacoesController.js";
import { requireAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

/**
 * Rotas para serviços de notificação do sistema.
 */

// Rota utilizada para disparar notificações Push (FCM) para os administradores
// quando um aluno realiza o envio de um novo documento
router.post("/upload-certificado", notificarAdminsUpload);
router.post("/certificado-analisado", ...requireAdmin, notificarAlunoCertificadoAnalisado);

export default router;
