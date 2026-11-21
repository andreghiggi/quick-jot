# WhatsApp — recuperação aprovada em 21/11/2026

## Implementado
- Reciclagem a cada quatro horas, em horários determinísticos por instância. Trava global impede dois reinícios simultâneos e mantém intervalo mínimo de um minuto entre lojas, inclusive chamadas manuais/eventos.
- Evento `connection.update` autenticado inicia recuperação sem aguardar horas sem tráfego. Eventos gerados pelo próprio reinício não iniciam outro reinício.
- Duas tentativas automáticas no máximo; logout explícito interrompe tentativas e sinaliza novo QR. Desconexão pelo operador permanece desconectada.
- Falha após dez segundos de verificação sinaliza recuperação pendente/bloqueada e necessidade de conferir sessão/QR. Timeout sozinho não prova corrupção das chaves.
- Mensagens temporárias, fotos/documentos/vídeos com legenda e wrappers de documentos; palavras atuais com acentos e letras repetidas mantidas. Cooldown de duas horas; tolerância de fila de quatro horas.
- O retorno de envio rejeitado não é mais informado como `replied: true`.
- Monitor exibe o resultado da recuperação independentemente do snapshot de tráfego antigo. Estado `open` não confirma recebimento de mensagens reais.

## Implantação, não executada nesta alteração
1. Aprovar **Deploy Supabase Migrations** deste commit na VPS.
2. Aprovar **Deploy Supabase Edge Functions**. Ele verifica a migração antes de substituir código e instala automaticamente o cron Linux autenticado, sem `pg_cron` e sem copiar credenciais para o repositório/crontab.
3. Aprovar **Deploy to VPS** para atualizar a tela do administrador.
4. Confirmar uma saudação real de outro telefone, seu evento de entrada e a resposta efetivamente recebida. Não confundir teste simulado com recuperação da sessão real.

Cron: uma invocação por minuto (1.440/dia); ajustes de webhook/configuração a cada dez minutos. O cron não envia mensagens de teste nem faz reset destrutivo.

## Verificações executáveis
```bash
bun x vitest run src/lib/whatsappRecovery.test.ts
bun scripts/test-whatsapp-webhook.mjs
bash scripts/test-whatsapp-recovery.sh
```
O teste SQL cria um PostgreSQL descartável com duas lojas fictícias, aplica a migração real e testa permissões, agenda, exclusão mútua, tentativas e logout. Rodando como root, requer usuário não privilegiado existente (`PG_TEST_USER`). Não usa credenciais nem altera a VPS.

## Limites conhecidos
Nenhuma destas medidas garante disponibilidade absoluta da Evolution/WhatsApp. Reinício suave pode interromper brevemente a conexão; um socket que continue `open` mas não receba eventos não é detectado diretamente por leitura de estado. A reciclagem reduz a duração possível desse estado, não prova que o eliminou. Falhas da rede, do provedor, perda de sessão ou mensagens não entregues ao webhook continuam exigindo observação real. Não foi acrescentado teste ativo por mensagens, novas palavras nem reinício destrutivo.