const CONTEXT_PROMPTS = {
  unauthenticated: `Você é um assistente virtual do SIGHC (Sistema Integrado de Gestão de Horas Complementares), um sistema acadêmico do SENAC para gerenciar atividades complementares de alunos universitários.

Sobre acesso ao sistema:
- O cadastro é criado por um técnico do SENAC, não pelo próprio aluno.
- O login utiliza o e-mail institucional do aluno (@senac ou similar).
- As credenciais de acesso (e-mail e senha) são enviadas automaticamente por e-mail após o cadastro ser realizado.
- Se o aluno não recebeu as credenciais ou não tem cadastro, deve entrar em contato com a secretaria do curso presencialmente ou pelos canais oficiais do SENAC.
- Não é possível criar conta manualmente pelo site.

Seja amigável, objetivo e claro. Responda sempre em português brasileiro.`,

  superAdmin: `Você é um assistente virtual especializado para o Superadministrador do SIGHC.
Você tem conhecimento completo do sistema e pode ajudar com: gestão de cursos e turmas, gerenciamento de coordenadores e alunos, configurações do sistema, relatórios e estatísticas globais, aprovação de certificados e resolução de problemas.
Seja técnico, preciso e direto. Responda sempre em português brasileiro.`,

  coordenador: `Você é um assistente virtual especializado para Coordenadores de Curso no SIGHC.
Você pode ajudar com: aprovação e rejeição de certificados de horas complementares, acompanhamento do progresso dos alunos da sua turma, gestão de turmas do curso, relatórios de horas e categorias de atividades complementares aceitas.
Seja prestativo e orientado à gestão acadêmica. Responda sempre em português brasileiro.`,

  aluno: `Você é um assistente virtual especializado para Alunos no SIGHC.
Você pode ajudar com: como enviar certificados de horas complementares, quais atividades são aceitas e suas categorias, acompanhamento do progresso de horas, status dos certificados enviados e dúvidas sobre o processo de validação.
Quando os dados do aluno estiverem disponíveis, use-os para personalizar suas respostas (progresso, horas faltantes, atividades elegíveis).
Seja amigável, paciente e explique de forma clara e simples. Responda sempre em português brasileiro.`,
};

function formatCursoRegras(cursos) {
  if (!cursos?.length) return "";
  const lines = [];
  for (const curso of cursos) {
    lines.push(`\nCurso: ${curso.nome} (meta: ${curso.metaHoras}h)`);
    if (curso.grupos?.length) {
      lines.push(`  Atividades aceitas:`);
      for (const grupo of curso.grupos) {
        lines.push(`    ${grupo.label}:`);
        for (const atv of grupo.atividades) {
          const req = atv.requisito ? ` | Requisito: ${atv.requisito}` : "";
          lines.push(`      • ${atv.descricao} (máx ${atv.horasMaximas}h${req})`);
        }
      }
    }
  }
  return lines.join("\n");
}

function formatCoordContext(coordContext) {
  if (!coordContext) return "";

  const { nomeCoord, cursos = [], stats } = coordContext;

  const lines = [
    `\n\n--- DADOS DO COORDENADOR (use para personalizar as respostas) ---`,
    `Nome: ${nomeCoord}`,
  ];

  if (stats) {
    lines.push(
      `\nCertificados sob sua gestão: ${stats.total} total | ${stats.pendentes} pendentes | ${stats.aprovados} aprovados | ${stats.rejeitados} rejeitados`
    );
  }

  const regras = formatCursoRegras(cursos);
  if (regras) lines.push(regras);
  lines.push(`--- FIM DOS DADOS ---`);
  return lines.join("\n");
}

function formatAlunoContext(alunoContext) {
  if (!alunoContext) return "";

  const { nomeAluno, cursos = [], certificados } = alunoContext;

  const lines = [
    `\n\n--- DADOS DO ALUNO (use para personalizar as respostas) ---`,
    `Nome: ${nomeAluno}`,
  ];

  const totalAprovadas = certificados?.horasAprovadas ?? 0;
  const totalCursos = cursos.length;

  for (const curso of cursos) {
    const { nome, metaHoras, grupos = [] } = curso;
    // Se o aluno tem só um curso, usa o total; caso contrário não temos dados por curso
    const aprovadas = totalCursos === 1 ? totalAprovadas : null;
    const pct = aprovadas !== null && metaHoras > 0 ? Math.round((aprovadas / metaHoras) * 100) : null;

    lines.push(`\nCurso: ${nome}`);
    lines.push(`Meta de horas complementares: ${metaHoras}h`);
    if (aprovadas !== null) {
      lines.push(
        `Progresso: ${aprovadas}h aprovadas de ${metaHoras}h (${pct}%) — faltam ${Math.max(0, metaHoras - aprovadas)}h`
      );
    }

    if (grupos.length > 0) {
      lines.push(`Atividades complementares aceitas neste curso:`);
      for (const grupo of grupos) {
        lines.push(`  ${grupo.label}:`);
        for (const atv of grupo.atividades) {
          const req = atv.requisito ? ` | Requisito: ${atv.requisito}` : "";
          lines.push(`    • ${atv.descricao} (máx ${atv.horasMaximas}h${req})`);
        }
      }
    }
  }

  if (certificados) {
    lines.push(
      `\nResumo geral de certificados: ${certificados.total} enviados | ${certificados.aprovados} aprovados | ${certificados.pendentes} pendentes | ${certificados.rejeitados} rejeitados`
    );
    if (totalCursos > 1) {
      lines.push(`Horas aprovadas no total (todos os cursos): ${totalAprovadas}h`);
    }
  }

  lines.push(`--- FIM DOS DADOS ---`);
  return lines.join("\n");
}

const VALID_CONTEXTS = ["unauthenticated", "superAdmin", "coordenador", "aluno"];
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 20;

export const enviarMensagem = async (req, res) => {
  try {
    const { message, context, history = [], alunoContext, coordenadorContext } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: "O campo message é obrigatório." });
    }

    if (message.trim().length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: "Mensagem muito longa." });
    }

    const ctx = VALID_CONTEXTS.includes(context) ? context : "unauthenticated";
    const systemPrompt =
      CONTEXT_PROMPTS[ctx] +
      (ctx === "aluno" ? formatAlunoContext(alunoContext) : "") +
      (ctx === "coordenador" ? formatCoordContext(coordenadorContext) : "");

    const safeHistory = Array.isArray(history)
      ? history.slice(-MAX_HISTORY_ITEMS)
      : [];

    const contents = [
      ...safeHistory.map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: String(msg.text).slice(0, MAX_MESSAGE_LENGTH) }],
      })),
      { role: "user", parts: [{ text: message.trim() }] },
    ];

    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    };

    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", JSON.stringify(data));
      return res.status(500).json({ error: "Erro ao processar sua mensagem." });
    }

    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Não consegui gerar uma resposta. Tente novamente.";

    return res.json({ response: text });
  } catch (error) {
    console.error("Erro no chat:", error);
    return res.status(500).json({ error: "Erro interno do servidor." });
  }
};
