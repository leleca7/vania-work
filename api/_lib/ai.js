import { generateObject, generateText } from 'ai';
import { z } from 'zod';

export const model = process.env.AI_MODEL || 'openai/gpt-5.6-sol';

export async function analyzeOpportunity(opportunity, prefs = {}) {
  const schema = z.object({
    score: z.number().int().min(0).max(100),
    summary: z.string().max(500),
    reason: z.string().max(700),
    action: z.string().max(300),
    risk: z.enum(['baixo','medio','alto']),
    estimated_hourly_usd: z.number().nonnegative().nullable(),
    recommended: z.boolean()
  });

  const prompt = `Você é o motor de triagem do Vania Work. Analise uma oportunidade de trabalho remoto para Vania.
Prioridade do usuário: ${prefs.priority || 'hourly_value'}. Horas disponíveis por dia: ${prefs.work_hours || 4}.
Nunca trate ganhos como garantidos. Não sugira violar regras de plataformas, automatizar respostas humanas, burlar screeners ou usar bots onde forem proibidos.
Dê nota de compatibilidade considerando clareza, pagamento por hora, dificuldade, risco, idioma, necessidade de experiência e probabilidade prática de execução.

Oportunidade:
${JSON.stringify(opportunity)}`;

  const { object } = await generateObject({ model, schema, prompt });
  return object;
}

export async function makeProposal(opportunity, profile = {}) {
  const prompt = `Crie uma proposta curta em português para um trabalho freelancer. Nome da profissional: ${profile.display_name || 'Vania'}.
Não invente experiência, certificados, resultados ou habilidades que não foram fornecidos. Seja profissional, natural e objetiva. Inclua no máximo uma pergunta útil ao cliente. Não diga que IA fará o trabalho.

Vaga: ${opportunity.title}\nDescrição: ${opportunity.description || ''}\nPlataforma: ${opportunity.platform}\nPagamento informado: ${opportunity.currency || ''} ${opportunity.pay_min ?? ''}${opportunity.pay_max ? '–' + opportunity.pay_max : ''}`;
  const { text } = await generateText({ model, prompt });
  return text.trim();
}

export async function assistantReply(question, context) {
  const prompt = `Você é o assistente do Vania Work, um painel pessoal para Vania organizar renda remota.
Responda em português simples, amigável e direto. Não prometa renda, não invente oportunidades e respeite as regras de automação. Quando faltar informação, diga isso claramente.
Contexto atual do painel: ${JSON.stringify(context)}
Pergunta da Vania: ${question}`;
  const { text } = await generateText({ model, prompt });
  return text.trim();
}
