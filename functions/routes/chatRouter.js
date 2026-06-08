import { Router } from "express";
import { enviarMensagem } from "../controllers/chatController.js";

const router = Router();

router.post("/mensagem", enviarMensagem);

export default router;
