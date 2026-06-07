import { Router } from "express";
import { processarCertificado, listarCertificados, extrairTextoOcr, analisarComIA } from "../controllers/certificadosController.js";
import { requireAdmin } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", ...requireAdmin, listarCertificados);
router.post("/processar", processarCertificado);
router.post("/ocr", extrairTextoOcr);
router.post("/analisar-ia", analisarComIA);

export default router;