# Retomar o backend (login) do ComandaTech

## Problema
Nenhum cliente consegue logar: o serviço de autenticação/banco hospedado na nuvem está pausado. A produção ainda aponta para esse serviço, então todo login falha. Não é senha nem o ajuste da impressão.

## Ações
1. Retomar (despausar) o backend da nuvem.
2. Aguardar a inicialização e confirmar que o serviço responde (health check).
3. Verificar no preview que a tela de login volta a autenticar (teste de sessão).
4. Confirmar ao usuário que o login voltou em produção (mesmo serviço atende preview e publicado).

## Garantias
- Nenhum dado é apagado, alterado ou rotacionado.
- Nenhuma nota fiscal é emitida.
- Nenhuma alteração de código nesta etapa.
- A nuvem volta a ficar disponível como fallback, como combinado na migração para a VPS.

## Detalhes técnicos
- Uso da ação de resume do backend gerenciado; verificação via health check e teste de sessão de auth.
- Sem migrações, sem mudanças de RLS, sem tocar em Storage.
