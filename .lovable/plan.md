# Fazer o login da Terra Viva funcionar

## Por que ela não entra

A Terra Viva foi cadastrada antes do ajuste do botão "Nova Empresa".
Naquele momento o cadastro criava só a loja e guardava o e-mail e a senha como anotação — a conta de acesso nunca chegou a ser criada.
Por isso o e-mail terraviva@gmail.com não entra: a loja existe, a conta de entrada não.

Na linha dela aparecem só "Módulos", "Bloquear" e "Acessar" porque o botão de credenciais some quando já existe senha anotada — sobra apenas o lapisinho de anotação, que não cria acesso nenhum.

## O que será feito

1. Colocar na linha de cada loja um botão sempre visível: **Ativar acesso**.
   Ele abre uma janelinha com o e-mail já preenchido, pede a senha (mínimo 6 caracteres) e, ao salvar, cria de fato a conta de entrada da loja, já ligada a ela como administradora. Se o e-mail já existir, apenas ajusta a senha.
2. Publicar essa mudança para os clientes (nenhuma alteração em pedidos, caixa, cardápio, impressão, TEF ou notas).
3. Usar o botão na Terra Viva, com o e-mail terraviva@gmail.com e a senha que você escolher.
4. Testar a entrada com esse e-mail e senha e confirmar que a loja abre normalmente.

O botão "Nova Empresa" você testa depois, como pediu — a parte dele já está pronta e vai junto na mesma publicação.

## Cuidados

- Nenhuma outra loja é alterada: nada de pedidos, vendas, caixa, impressão, TEF ou notas fiscais é tocado.
- Se a publicação apresentar problema, o sistema volta sozinho para a versão atual.

## Detalhes técnicos

- `src/pages/admin/AdminDashboard.tsx`: adicionar botão "Ativar acesso" na coluna de ações de cada linha, abrindo o diálogo já existente (`editCredentialsCompanyId`) com `login_email` pré-preenchido; reaproveita `handleSaveCredentials`, que já invoca `create-company-user`.
- Edge function `create-company-user` já existe: valida super_admin/reseller dono, `createUser` com `email_confirm: true`, upsert em `profiles`, vínculo em `company_users` (is_owner) e papel `company_admin` em `user_roles`; se o e-mail existir, faz `updateUserById` com a nova senha.
- Confirmar que a função está deployada no ambiente de produção (VPS) e com `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` definidos lá; sem isso a ativação falha.
- Publicação pelo workflow `deploy-vps.yml` (build + validação de bundle + rollback automático).
- Nenhuma mudança de schema.
