# Restaurar o login de todos os clientes

## Diagnóstico confirmado

- O serviço hospedado de banco e autenticação está **pausado**.
- O site em produção ainda envia o login para esse serviço pausado.
- Por isso, todas as lojas são afetadas ao mesmo tempo.
- O fluxo de login está compilando normalmente, e o trecho que apagava sessões já não está no código atual.

## Correção

1. Reativar o serviço hospedado, sem alterar ou apagar dados.
2. Aguardar até banco e autenticação ficarem saudáveis.
3. Testar uma autenticação real no site em produção e confirmar que a sessão permanece após atualizar a página.
4. Se o serviço voltar saudável, não alterar o código de login.

## Limites

- Nenhuma alteração fiscal, TEF, impressão ou banco de dados.
- Nenhuma emissão de nota de teste.
- Nenhuma troca de endereço, chave ou senha.
