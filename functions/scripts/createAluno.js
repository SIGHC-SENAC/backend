import readline from "readline";
import { auth_firebase, db } from "../config/firebase.js";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function perguntar(pergunta) {
  return new Promise((resolve) => rl.question(pergunta, resolve));
}

function separador() {
  console.log("─".repeat(50));
}

async function escolherDaLista(itens, formatarItem, titulo) {
  console.log(`\n${titulo}`);
  separador();
  itens.forEach((item, i) => console.log(`  [${i + 1}] ${formatarItem(item)}`));
  separador();

  while (true) {
    const entrada = await perguntar(`Escolha (1-${itens.length}): `);
    const idx = parseInt(entrada, 10) - 1;
    if (idx >= 0 && idx < itens.length) return itens[idx];
    console.log(`  ⚠  Digite um número entre 1 e ${itens.length}.`);
  }
}

async function criarAluno() {
  try {
    console.log("\n╔══════════════════════════════════════════╗");
    console.log("║         Cadastro de Aluno — SIGHC        ║");
    console.log("╚══════════════════════════════════════════╝\n");

    // ── 1. Listar e escolher curso ─────────────────────
    const cursosSnap = await db.collection("cursos").orderBy("nome").get();
    if (cursosSnap.empty) {
      console.error("❌  Nenhum curso cadastrado no sistema.");
      rl.close();
      return;
    }
    const cursos = cursosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const cursoEscolhido = await escolherDaLista(
      cursos,
      (c) => `${c.nome}${c.codigo ? `  (${c.codigo})` : ""}`,
      "📚  Cursos disponíveis"
    );
    console.log(`\n  ✔  Curso: ${cursoEscolhido.nome}\n`);

    // ── 2. Listar e escolher turma do curso ────────────
    const turmasSnap = await db
      .collection("turmas")
      .where("cursoId", "==", cursoEscolhido.id)
      .get();

    if (turmasSnap.empty) {
      console.error(`❌  Nenhuma turma cadastrada para o curso "${cursoEscolhido.nome}".`);
      rl.close();
      return;
    }
    const turmas = turmasSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const turmaEscolhida = await escolherDaLista(
      turmas,
      (t) => `${t.nome}${t.horario ? `  — ${t.horario}` : ""}${t.periodoInicio ? `  (${t.periodoInicio} → ${t.periodoFinal ?? "?"})` : ""}`,
      "🏫  Turmas disponíveis"
    );
    console.log(`  ✔  Turma: ${turmaEscolhida.nome}\n`);

    // ── 3. Dados do aluno ──────────────────────────────
    separador();
    console.log("👤  Dados do aluno");
    separador();
    const nome  = await perguntar("  Nome completo : ");
    const email = await perguntar("  E-mail        : ");
    const senha = await perguntar("  Senha         : ");
    separador();

    // ── 4. Confirmação ─────────────────────────────────
    console.log("\n📋  Resumo:");
    console.log(`  Nome   : ${nome}`);
    console.log(`  E-mail : ${email}`);
    console.log(`  Curso  : ${cursoEscolhido.nome}`);
    console.log(`  Turma  : ${turmaEscolhida.nome}`);
    const confirmacao = await perguntar("\nConfirmar cadastro? (s/N): ");
    if (!["s", "S"].includes(confirmacao.trim())) {
      console.log("\n  Operação cancelada.");
      rl.close();
      return;
    }

    // ── 5. Criar no Firebase Auth ──────────────────────
    const user = await auth_firebase.createUser({
      email,
      password: senha,
      displayName: nome,
    });

    try {
      await auth_firebase.setCustomUserClaims(user.uid, { role: "aluno" });

      await db.collection("users").doc(user.uid).set({
        nome,
        email,
        role: "aluno",
        cursoId: cursoEscolhido.id,
        cursoNome: cursoEscolhido.nome,
        cursoCodigo: cursoEscolhido.codigo ?? null,
        turmaId: turmaEscolhida.id,
        turmaNome: turmaEscolhida.nome,
        createdAt: Date.now(),
      });

      console.log("\n✅  Aluno cadastrado com sucesso!");
      console.log(`  UID : ${user.uid}`);
    } catch (firestoreError) {
      await auth_firebase.deleteUser(user.uid);
      console.error("\n❌  Erro ao salvar no Firestore (Auth revertido):", firestoreError.message);
    }

    rl.close();
  } catch (error) {
    console.error("\n❌  Erro:", error.message);
    rl.close();
  }
}

criarAluno();
