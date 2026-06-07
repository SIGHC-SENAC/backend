import readline from "readline";
import { auth_firebase, db } from "../config/firebase.js";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function perguntar(pergunta) {
  return new Promise((resolve) => rl.question(pergunta, resolve));
}

function separador() {
  console.log("─".repeat(55));
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

// ── lista de alunos a importar ───────────────────────────────────────────────
const ALUNOS = [
  { nome: "ABIGAIL MARIA GONÇALVES NAZÁRIO", email: "abigail.nazario0020016295@edu.pe.senac.br" },
  { nome: "ABRAÃO VINÍCIUS FREITAS DE MELO", email: "abraao.melo0020016280@edu.pe.senac.br" },
  { nome: "ANGELO MASCARENHAS DE SOUZA", email: "angelo.souza0020016369@edu.pe.senac.br" },
  { nome: "ARTHUR FILIPE RODRIGUES DA SILVA", email: "arthur.silva0020016325@edu.pe.senac.br" },
  { nome: "CAROLLINE BARBOSA FERREIRA", email: "carolline.ferreira0020016319@edu.pe.senac.br" },
  { nome: "ENZO ANTÔNIO SOARES SILVA", email: "enzo.silva0020016372@edu.pe.senac.br" },
  { nome: "ERICK ALLAN GOMES", email: "erick.gomes0020016360@edu.pe.senac.br" },
  { nome: "EVERSON JOSÉ DO NASCIMENTO", email: "everson.nascimento0020016405@edu.pe.senac.br" },
  { nome: "FÁBIO FAUSTINO MOURA DA SILVA", email: "fabio.silva0020016370@edu.pe.senac.br" },
  { nome: "FILIPE XAVIER DOS SANTOS", email: "filipe.santos0020016294@edu.pe.senac.br" },
  { nome: "GABRIEL FELICIANO DE OLIVEIRA COSTA", email: "gabriel.costa0020016367@edu.pe.senac.br" },
  { nome: "IGOR ALVES CAVALCANTI DE ARAUJO", email: "igor.araujo0020016355@edu.pe.senac.br" },
  { nome: "JOÃO VICTOR DA SILVA", email: "joao.silva0020016277@edu.pe.senac.br" },
  { nome: "JÚLIO CÉSAR MARTINS SOARES", email: "julio.soares0020016284@edu.pe.senac.br" },
  { nome: "KAUÃ OLIVEIRA MATOS BORBA", email: "kaua.borba0020016338@edu.pe.senac.br" },
  { nome: "KALLYNE VICTÓRIA GOMES DE MELO", email: "kallyne.melo0020016318@edu.pe.senac.br" },
  { nome: "LUCAS GABRIEL DA SILVA SANTANA", email: "lucas.santana0020016371@edu.pe.senac.br" },
  { nome: "LUCAS SILVA DE SOUZA", email: "lucas.souza0020016324@edu.pe.senac.br" },
  { nome: "LUIS AUGUSTO SILVA DE SÁ", email: "luis.sa0020016349@edu.pe.senac.br" },
  { nome: "MARIA CECÍLIA DE LIMA E SILVA", email: "maria.silva0020016281@edu.pe.senac.br" },
  { nome: "MARIA CLARA BARBOSA FILGUEIRAS", email: "maria.filgueiras0020016287@edu.pe.senac.br" },
  { nome: "MARIA CLARA MOUTINHO ALBUQUERQUE SILVA", email: "maria.silva0020016354@edu.pe.senac.br" },
  { nome: "MARIA EDUARDA PEREIRA VILARIM", email: "maria.vilarim0020016273@edu.pe.senac.br" },
  { nome: "MATHEUS ALVES DE ARRUDA", email: "matheus.arruda0020016315@edu.pe.senac.br" },
  { nome: "MORGANA BARBOSA DA SILVA", email: "morgana.silva0020016317@edu.pe.senac.br" },
  { nome: "RHUAN PIETRO MARINS TRIGUEIRO DA COSTA", email: "rhuan.costa0020016408@edu.pe.senac.br" },
  { nome: "RUTH CAMILE FERREIRA DE SOUZA ANASTACIO", email: "ruth.anastacio0020016314@edu.pe.senac.br" },
  { nome: "SAM FERREIRA DE MELO", email: "sam.melo0020016356@edu.pe.senac.br" },
  { nome: "SOFIA LEITÃO DE AZEVEDO", email: "sofia.azevedo0020016282@edu.pe.senac.br" },
  { nome: "TAMIRYS MARIA SILVA DA COSTA", email: "tamirys.costa0020016290@edu.pe.senac.br" },
  { nome: "TIAGO FILIPE AZEVEDO DA SILVA", email: "tiago.silva0020016400@edu.pe.senac.br" },
  { nome: "YURE CÉSAR DOS SANTOS FARIAS CHALEGA", email: "yure.chalega0020016279@edu.pe.senac.br" },
];

// ── helpers ──────────────────────────────────────────────────────────────────
function senhaTemporaria(email) {
  return `${email.split("@")[0]}2026!`;
}

async function buscarUsuarioPorEmail(email) {
  try {
    return await auth_firebase.getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") return null;
    throw error;
  }
}

async function upsertAluno(aluno, cursoId, cursoData, turmaId, turmaData) {
  const existente = await buscarUsuarioPorEmail(aluno.email);
  const userRecord = existente || await auth_firebase.createUser({
    email: aluno.email,
    displayName: aluno.nome,
    password: senhaTemporaria(aluno.email),
  });

  await auth_firebase.updateUser(userRecord.uid, { displayName: aluno.nome });
  await auth_firebase.setCustomUserClaims(userRecord.uid, {
    ...(userRecord.customClaims || {}),
    role: "aluno",
  });

  const now = Date.now();
  const userRef = db.collection("users").doc(userRecord.uid);
  const userDoc = await userRef.get();
  const dadosAtuais = userDoc.exists ? userDoc.data() : {};
  const cursoIds = Array.from(new Set([...(dadosAtuais.cursoIds || []), cursoId]));

  await userRef.set({
    ...dadosAtuais,
    nome: aluno.nome,
    email: aluno.email,
    role: "aluno",
    cursoId,
    cursoCodigo: cursoData.codigo,
    cursoNome: cursoData.nome,
    cursoIds,
    turmaId,
    turmaNome: turmaData.nome,
    updatedAt: now,
    createdAt: dadosAtuais.createdAt || now,
    createdBy: dadosAtuais.createdBy || "script:adicionarAlunos",
  }, { merge: true });

  return existente ? "atualizado" : "criado";
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔═══════════════════════════════════════════════════╗");
  console.log("║       Importação em lote de Alunos — SIGHC        ║");
  console.log("╚═══════════════════════════════════════════════════╝");
  console.log(`\n  ${ALUNOS.length} aluno(s) na fila de importação.\n`);

  // 1. Selecionar curso
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
  console.log(`\n  ✔  Curso: ${cursoEscolhido.nome}`);

  // 2. Selecionar turma
  const turmasSnap = await db.collection("turmas").where("cursoId", "==", cursoEscolhido.id).get();
  if (turmasSnap.empty) {
    console.error(`\n❌  Nenhuma turma cadastrada para o curso "${cursoEscolhido.nome}".`);
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

  // 3. Confirmação final
  separador();
  console.log(`  Curso : ${cursoEscolhido.nome}`);
  console.log(`  Turma : ${turmaEscolhida.nome}`);
  console.log(`  Alunos: ${ALUNOS.length}`);
  separador();
  console.log("\n  ⚠️   Nenhum e-mail será enviado aos alunos.");
  console.log(`  Senha temporária: <prefixo_do_email>2026!\n`);

  const confirmacao = await perguntar('  Digite "CONFIRMAR" para iniciar a importação: ');
  if (confirmacao.trim() !== "CONFIRMAR") {
    console.log("\n  Operação cancelada.\n");
    rl.close();
    return;
  }

  // 4. Importar
  console.log("\n  Importando...\n");
  const resultado = { criados: 0, atualizados: 0, erros: 0 };

  for (const aluno of ALUNOS) {
    try {
      const status = await upsertAluno(
        aluno,
        cursoEscolhido.id,
        cursoEscolhido,
        turmaEscolhida.id,
        turmaEscolhida
      );
      resultado[status === "criado" ? "criados" : "atualizados"] += 1;
      console.log(`  ${status === "criado" ? "✅ CRIADO    " : "🔄 ATUALIZADO"} ${aluno.nome}`);
    } catch (error) {
      resultado.erros += 1;
      console.error(`  ❌ ERRO       ${aluno.nome} — ${error.message}`);
    }
  }

  separador();
  console.log(`\n  Criados    : ${resultado.criados}`);
  console.log(`  Atualizados: ${resultado.atualizados}`);
  console.log(`  Erros      : ${resultado.erros}\n`);

  if (resultado.erros > 0) process.exitCode = 1;
  rl.close();
}

main().catch((error) => {
  console.error("\n❌  Falha geral:", error.message);
  process.exitCode = 1;
  rl.close();
});
