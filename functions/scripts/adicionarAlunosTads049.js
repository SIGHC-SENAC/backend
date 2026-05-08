import { auth_firebase, db } from "../config/firebase.js";
import { transporter } from "../config/nodemailer.js";

const CURSO_ID = "joTa1aQkKBd9inyt6zqZ";
const TURMA_ID = "cerTNSGqP0amjxuXGsJ2";
const APP_URL = "https://sighc.com.br";
const DELAY_EMAIL_MS = Number(3000);

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

function senhaTemporaria(email) {
  return `${email.split("@")[0]}2026!`;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buscarUsuarioPorEmail(email) {
  try {
    return await auth_firebase.getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") return null;
    throw error;
  }
}

async function carregarCursoETurma() {
  const [cursoDoc, turmaDoc] = await Promise.all([
    db.collection("cursos").doc(CURSO_ID).get(),
    db.collection("turmas").doc(TURMA_ID).get(),
  ]);

  if (!cursoDoc.exists) {
    throw new Error(`Curso nao encontrado: ${CURSO_ID}`);
  }

  if (!turmaDoc.exists) {
    throw new Error(`Turma nao encontrada: ${TURMA_ID}`);
  }

  const curso = cursoDoc.data();
  const turma = turmaDoc.data();

  if (turma.cursoId && turma.cursoId !== CURSO_ID) {
    throw new Error(`A turma ${TURMA_ID} nao pertence ao curso ${CURSO_ID}`);
  }

  return { curso, turma };
}

async function enviarEmailBoasVindas(aluno) {
  const senha = senhaTemporaria(aluno.email);

  await transporter.sendMail({
    from: `"Horas Complementares - Senac" <${process.env.USER_GMAIL}>`,
    to: aluno.email,
    subject: "Bem-vindo ao Sistema de Horas Complementares - Senac",
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 100%); padding: 32px 24px; text-align: center;">
          <img src="${APP_URL}/logo.png" alt="Senac Pernambuco" style="height: 56px; margin-bottom: 12px;" />
          <p style="color: rgba(255,255,255,0.85); font-size: 13px; margin: 0;">Sistema Academico de Horas Complementares</p>
        </div>

        <div style="padding: 32px 28px;">
          <h2 style="color: #1e3a5f; font-size: 22px; margin: 0 0 8px;">Ola, ${aluno.nome}!</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
            Sua conta foi criada com sucesso. Use as credenciais abaixo para acessar o sistema pela primeira vez.
          </p>

          <div style="background: #f1f5f9; border-left: 4px solid #1e3a5f; border-radius: 8px; padding: 20px; margin: 0 0 24px;">
            <p style="margin: 0 0 8px; color: #334155; font-size: 14px;">
              <strong>E-mail:</strong> ${aluno.email}
            </p>
            <p style="margin: 0; color: #334155; font-size: 14px;">
              <strong>Senha temporaria:</strong>
              <code style="background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 14px;">${senha}</code>
            </p>
          </div>

          <div style="background: #fef3c7; border-radius: 8px; padding: 14px 16px; margin: 0 0 24px;">
            <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5;">
              <strong>Importante:</strong> Redefina sua senha no primeiro acesso para garantir a seguranca da sua conta.
            </p>
          </div>

          <div style="text-align: center; margin: 0 0 8px;">
            <a href="${APP_URL}/first-access"
               style="display: inline-block; background: linear-gradient(135deg, #1e3a5f, #2d5a8e); color: #ffffff; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
              Acessar o Sistema
            </a>
          </div>
        </div>

        <div style="background: #f8fafc; padding: 20px 28px; border-top: 1px solid #e2e8f0; text-align: center;">
          <p style="margin: 0 0 4px; font-size: 12px; color: #94a3b8;">Faculdade Senac Pernambuco</p>
          <p style="margin: 0; font-size: 11px; color: #cbd5e1;">Projeto Integrador 3 Periodo</p>
        </div>
      </div>
    `,
  });
}

async function upsertAluno(aluno, curso, turma) {
  const existente = await buscarUsuarioPorEmail(aluno.email);
  const userRecord = existente || await auth_firebase.createUser({
    email: aluno.email,
    displayName: aluno.nome,
    password: senhaTemporaria(aluno.email),
  });

  await auth_firebase.updateUser(userRecord.uid, {
    displayName: aluno.nome,
  });

  await auth_firebase.setCustomUserClaims(userRecord.uid, {
    ...(userRecord.customClaims || {}),
    role: "aluno",
  });

  const now = Date.now();
  const userRef = db.collection("users").doc(userRecord.uid);
  const userDoc = await userRef.get();
  const dadosAtuais = userDoc.exists ? userDoc.data() : {};
  const cursoIds = Array.from(new Set([...(dadosAtuais.cursoIds || []), CURSO_ID]));

  await userRef.set({
    ...dadosAtuais,
    nome: aluno.nome,
    email: aluno.email,
    role: "aluno",
    cursoId: CURSO_ID,
    cursoCodigo: curso.codigo,
    cursoNome: curso.nome,
    cursoIds,
    turmaId: TURMA_ID,
    turmaNome: turma.nome,
    updatedAt: now,
    createdAt: dadosAtuais.createdAt || now,
    createdBy: dadosAtuais.createdBy || "script:adicionarAlunosTads049",
  }, { merge: true });

  return existente ? "atualizado" : "criado";
}

async function main() {
  if (process.env.CONFIRM_IMPORT !== "SIM") {
    console.log("Importacao bloqueada por seguranca.");
    console.log("Para executar, rode com CONFIRM_IMPORT=sim.");
    process.exitCode = 1;
    return;
  }

  const { curso, turma } = await carregarCursoETurma();
  const resultado = { criados: 0, atualizados: 0, emails: 0, erros: 0 };

  for (const aluno of ALUNOS) {
    try {
      const status = await upsertAluno(aluno, curso, turma);
      resultado[status === "criado" ? "criados" : "atualizados"] += 1;
      console.log(`${status.toUpperCase()}: ${aluno.nome} <${aluno.email}>`);

      await enviarEmailBoasVindas(aluno);
      resultado.emails += 1;
      console.log(`EMAIL ENVIADO: ${aluno.email}`);

      if (DELAY_EMAIL_MS > 0) {
        await esperar(DELAY_EMAIL_MS);
      }
    } catch (error) {
      resultado.erros += 1;
      console.error(`ERRO: ${aluno.nome} <${aluno.email}>`, error.message);
    }
  }

  console.log("\nResumo:");
  console.log(`Criados: ${resultado.criados}`);
  console.log(`Atualizados: ${resultado.atualizados}`);
  console.log(`E-mails enviados: ${resultado.emails}`);
  console.log(`Erros: ${resultado.erros}`);

  if (resultado.erros > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Falha geral na importacao:", error);
  process.exitCode = 1;
});
