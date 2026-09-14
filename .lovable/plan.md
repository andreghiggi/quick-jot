# Recuperar o acesso à base do ComandaTech

## Diagnóstico confirmado

- O aplicativo está configurado para a base correta: `iwmrtxdzlkasuzutxvhh.supabase.co`.
- O Lovable Cloud foi reativado, mas o endereço ainda não está sendo publicado no DNS.
- As verificações de autenticação e banco falham com `no such host`; por isso todos os clientes ficam sem login e sem acesso aos dados.
- Não é um erro específico de uma loja, senha ou tela do sistema.

## Correção

1. Reiniciar o Lovable Cloud para forçar a recuperação dos serviços e do endereço.
2. Acompanhar o estado até banco e autenticação ficarem saudáveis.
3. Confirmar que o endereço volta a responder.
4. Validar, sem alterar dados:
   - autenticação;
   - leitura das empresas;
   - acesso do aplicativo à base;
   - abertura da tela de login e persistência da sessão.
5. Se o endereço continuar inexistente após a reinicialização, interromper novas tentativas e registrar como falha de infraestrutura do Lovable Cloud, sem modificar o aplicativo para contornar o problema.

## Segurança e escopo

- Nenhum dado será apagado, restaurado ou importado.
- Nenhuma configuração fiscal, TEF, impressão ou empresa será alterada.
- Nenhuma nota será emitida, reemitida ou inutilizada.
- Não haverá troca de endereço, chave ou credencial do aplicativo.
