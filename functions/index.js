import express from "express";
import alunosRoutes from "./routes/alunosRouter.js";
import * as functions from "firebase-functions";
import authRoutes from "./routes/authRouter.js";
import notificacoesRoutes from "./routes/notificacoesRouter.js";
import cursosRoutes from "./routes/cursosRouter.js";
import certificadosRoutes from "./routes/certificadosRouter.js";
import adminsRoutes from "./routes/adminsRouter.js";
import turmasRoutes from "./routes/turmasRouter.js";
import cors from "cors";

const router = express();
router.use(express.json());
router.use(cors());

const apiServices = [
  { name: "Autenticacao", path: "/auth", status: "online" },
  { name: "Alunos", path: "/alunos", status: "online" },
  { name: "Notificacoes", path: "/notificacoes", status: "online" },
  { name: "Cursos", path: "/cursos", status: "online" },
  { name: "Certificados", path: "/certificados", status: "online" },
  { name: "Administradores", path: "/admins", status: "online" },
  { name: "Turmas", path: "/turmas", status: "online" },
];

// rotas
router.use("/auth", authRoutes);
router.use("/alunos", alunosRoutes);
router.use("/notificacoes", notificacoesRoutes);
router.use("/cursos", cursosRoutes);
router.use("/certificados", certificadosRoutes);
router.use("/admins", adminsRoutes);
router.use("/turmas", turmasRoutes);

router.get("/", (req, res) => {
  const generatedAt = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const rows = apiServices
    .map(
      (service) => `
        <tr>
          <td>${service.name}</td>
          <td><code>${service.path}</code></td>
          <td><span class="status status-${service.status}">${service.status}</span></td>
        </tr>`,
    )
    .join("");

  res
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Status da API SIGHC</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Arial, Helvetica, sans-serif;
        background: #f4f7fb;
        color: #162033;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px 16px;
      }

      main {
        width: min(920px, 100%);
        background: #ffffff;
        border: 1px solid #d9e2ef;
        border-radius: 8px;
        box-shadow: 0 18px 50px rgba(22, 32, 51, 0.08);
        overflow: hidden;
      }

      header {
        padding: 28px 32px 20px;
        border-bottom: 1px solid #e6edf6;
      }

      h1 {
        margin: 0 0 8px;
        font-size: clamp(1.75rem, 4vw, 2.4rem);
        font-weight: 700;
      }

      p {
        margin: 0;
        color: #526178;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 16px 32px;
        text-align: left;
        border-bottom: 1px solid #edf2f8;
      }

      th {
        color: #526178;
        font-size: 0.78rem;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      tr:last-child td {
        border-bottom: 0;
      }

      code {
        color: #1d4ed8;
        background: #eff6ff;
        border-radius: 6px;
        padding: 4px 7px;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 6px 10px;
        font-weight: 700;
        text-transform: capitalize;
      }

      .status::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: currentColor;
      }

      .status-online {
        color: #047857;
        background: #d1fae5;
      }

      footer {
        padding: 18px 32px;
        color: #526178;
        background: #f8fafc;
        border-top: 1px solid #e6edf6;
        font-size: 0.95rem;
      }

      @media (max-width: 640px) {
        main {
          overflow-x: auto;
        }

        header,
        footer,
        th,
        td {
          padding-left: 18px;
          padding-right: 18px;
        }
      }

      @media (prefers-color-scheme: dark) {
        :root {
          background: #111827;
          color: #f8fafc;
        }

        main {
          background: #182235;
          border-color: #26344b;
          box-shadow: none;
        }

        header,
        footer,
        th,
        td {
          border-color: #26344b;
        }

        footer {
          background: #131c2b;
        }

        p,
        th,
        footer {
          color: #a8b3c7;
        }

        code {
          color: #93c5fd;
          background: #172554;
        }

        .status-online {
          color: #34d399;
          background: rgba(6, 95, 70, 0.35);
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Status da API SIGHC</h1>
        <p>Servicos disponiveis na rota base da API.</p>
      </header>
      <table>
        <thead>
          <tr>
            <th>Servico</th>
            <th>Rota</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <footer>Atualizado em ${generatedAt}</footer>
    </main>
  </body>
</html>`);
});

export const app = functions.https.onRequest(router);
