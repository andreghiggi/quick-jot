# Fazer o login da Terra Viva funcionar

## O que está acontecendo

A loja Terra Viva Floricultura foi cadastrada antes do ajuste no botão "Nova Empresa".
Naquele momento o cadastro criava apenas a loja, sem criar a conta de acesso.
Por isso o e-mail terraviva@gmail.com não entra: a loja existe, mas a conta de login nunca foi criada.

O ajuste já feito (criar loja + conta juntos, e "Editar credenciais" trocar a senha de verdade) ainda não está no ar para os clientes.

## Como resolver

1. Conferir, no servidor que os clientes usam, se a rotina que cria a conta de acesso está instalada e respondendo. Se não estiver, instalá-la.
2. Publicar a versão com o ajuste do botão "Nova Empresa" e do "Editar credenciais" (nenhuma mudança em pedidos, caixa, impressão, TEF ou notas).
3. No Painel Admin > Lojas Diretas, abrir "Editar credenciais" da Terra Viva, informar o e-mail e uma senha nova (mínimo 6 caracteres) e salvar. Isso cria a conta de acesso e já a liga à loja como administradora.
4. Testar o login com esse e-mail e senha e confirmar que a loja abre normalmente (cardápio, pedidos, configurações).
5. Repetir o passo 3 para as outras lojas da lista que também foram criadas antes do ajuste, se você quiser que elas passem a acessar.

## Cuidados

- Nada de outras lojas é alterado: nenhum pedido, caixa, venda, impressão, TEF ou nota fiscal é tocado.
- Se a publicação der qualquer problema, o sistema volta sozinho para a versão atual.

## Detalhes técnicos

- Edge function `create-company-user` já existe no repositório: valida super_admin/reseller dono, cria o usuário com `email_confirm: true`, faz upsert em `profiles`, vincula em `company_users` (is_owner) e atribui `company_admin` em `user_roles`. Se o e-mail já existir, apenas atualiza a senha.
- `src/pages/admin/AdminDashboard.tsx` já invoca essa função em `handleCreateCompany` e em `handleSaveCredentials`; falta apenas o deploy.
- Verificar na VPS se a função está deployada e se `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` estão configurados lá; sem isso a criação de acesso falha.
- Deploy via workflow `deploy-vps.yml` (build + validate-bundle + rsync com rollback automático).
- Nenhuma alteração de schema é necessária.
