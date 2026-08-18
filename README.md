# Vania Work

Painel pessoal da Vania para organizar oportunidades de renda remota, freelas, estudos e ganhos sem automatizar etapas que precisam ser humanas.

## Arquitetura v0.2

- **Frontend:** HTML/CSS/JS mobile-first.
- **Login e banco:** Supabase Auth + Postgres com RLS por usuário.
- **IA:** Vercel AI Gateway via AI SDK, executada somente no backend.
- **Monitor:** endpoint agendado a cada 12h; a preferência individual decide se cada ciclo roda em 12h ou 24h.
- **Segurança:** nenhuma chave secreta fica no navegador ou no GitHub.

## Dados salvos

`profiles`, `user_preferences`, `opportunities`, `earnings`, `monitor_runs`, `ai_events` e `platform_rules`.

## IA

A IA pode analisar e resumir oportunidades, estimar prioridade, preparar propostas e responder no assistente. Ela não responde screeners, pesquisas, testes humanos nem executa automações bloqueadas pelas regras das plataformas.

## Configuração

1. Criar um projeto Supabase separado para o Vania Work.
2. Aplicar `supabase/migrations/001_vania_work_core.sql`.
3. Configurar as variáveis descritas em `.env.example` na Vercel.
4. Criar a conta da Vania no Supabase Auth.
5. Fazer deploy na Vercel.

A aplicação mantém o modo demonstração quando o backend ainda não está configurado.
