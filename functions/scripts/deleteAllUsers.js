import readline from "readline";
import { auth_firebase } from "../config/firebase.js";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function perguntar(pergunta) {
  return new Promise((resolve) => rl.question(pergunta, resolve));
}

function separador() {
  console.log("─".repeat(50));
}

async function listarTodosUsuarios() {
  const usuarios = [];
  let pageToken;

  do {
    const result = await auth_firebase.listUsers(1000, pageToken);
    usuarios.push(...result.users);
    pageToken = result.pageToken;
  } while (pageToken);

  return usuarios;
}

async function deletarTodosUsuarios() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║    Exclusão de Usuários do Auth — SIGHC  ║");
  console.log("╚══════════════════════════════════════════╝\n");

  console.log("  Buscando usuários...");
  const usuarios = await listarTodosUsuarios();

  if (usuarios.length === 0) {
    console.log("\n  Nenhum usuário encontrado no Auth.");
    rl.close();
    return;
  }

  separador();
  console.log(`  Total encontrado: ${usuarios.length} usuário(s)\n`);
  usuarios.forEach((u, i) => {
    console.log(`  [${String(i + 1).padStart(3, " ")}] ${u.email ?? "(sem e-mail)"}  —  ${u.uid}`);
  });
  separador();

  console.log("\n  ⚠️   ATENÇÃO: esta ação é IRREVERSÍVEL.");
  console.log("  Todos os usuários listados acima serão removidos do Firebase Auth.\n");

  const confirmacao = await perguntar('  Digite "CONFIRMAR" para prosseguir: ');
  if (confirmacao.trim() !== "CONFIRMAR") {
    console.log("\n  Operação cancelada.\n");
    rl.close();
    return;
  }

  // Firebase Admin suporta até 1000 UIDs por chamada deleteUsers
  const uids = usuarios.map((u) => u.uid);
  const BATCH = 1000;
  let deletados = 0;
  let erros = 0;

  console.log("\n  Deletando...");
  for (let i = 0; i < uids.length; i += BATCH) {
    const lote = uids.slice(i, i + BATCH);
    const result = await auth_firebase.deleteUsers(lote);
    deletados += result.successCount;
    erros += result.failureCount;

    if (result.errors.length > 0) {
      result.errors.forEach((e) => {
        console.error(`  ⚠  Falha ao deletar UID ${e.index}: ${e.error.message}`);
      });
    }
  }

  separador();
  console.log(`\n✅  Concluído: ${deletados} deletado(s)${erros > 0 ? `, ${erros} com erro` : ""}.`);
  rl.close();
}

deletarTodosUsuarios().catch((err) => {
  console.error("\n❌  Erro inesperado:", err.message);
  rl.close();
});
