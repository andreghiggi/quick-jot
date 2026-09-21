# Botão "Nova Empresa": criar a loja já com login funcionando

## O que está acontecendo (confirmado no código)

Quando você cadastra uma loja pelo botão **Nova Empresa** no Painel Admin, o sistema só grava o nome, o apelido (slug), o telefone, o e-mail e a senha como **texto** na ficha da empresa. Ele **não cria o usuário de acesso**.

Ou seja: o e-mail e a senha que aparecem na lista são apenas uma anotação. Não existe nenhuma conta criada com eles, e por isso o login sempre falha.

O cadastro feito pelo **revendedor** funciona porque, além de gravar a ficha, ele chama a rotina que realmente cria o usuário, liga o usuário à loja e dá a permissão de administrador da loja. O botão do Painel Admin nunca recebeu essa etapa.

A tela **Editar credenciais** do Painel Admin tem o mesmo problema: ela troca o texto anotado, mas não troca a senha de verdade.

## O que será ajustado

1. **Nova Empresa** passa a fazer as três etapas, na ordem:
   - cria a ficha da loja (como hoje);
   - cria a conta de acesso com o e-mail e a senha informados, já confirmada;
   - liga essa conta à loja como administrador dela.
2. Se o e-mail já existir, a senha dele é atualizada e a conta é ligada à nova loja (mesmo comportamento já usado no cadastro do revendedor).
3. **Editar credenciais** passa a aplicar de verdade o novo e-mail/senha, e não só o texto.
4. E-mail e senha passam a ser obrigatórios no formulário de nova empresa (senha mínima de 6 caracteres), com aviso claro se a criação do acesso falhar — nesse caso a loja não fica "meio criada" sem aviso.

## Verificação

- Criar uma loja de teste pelo botão, sair, entrar com o e-mail e a senha cadastrados e confirmar que abre o painel da loja nova normalmente.
- Confirmar que as lojas já existentes continuam entrando igual.

## Detalhes técnicos

- `src/pages/admin/AdminDashboard.tsx` → `handleCreateCompany`: após o `insert` em `companies` (com `.select().single()`), invocar `supabase.functions.invoke('create-company-user', { company_id, email, password, full_name })`, mesmo padrão de `useResellerPortal.createCompany`.
- `handleSaveCredentials`: além do `update` em `companies`, invocar a mesma função para o `company_id` editado, garantindo criação/atualização real da senha e do vínculo.
- A função `create-company-user` já autoriza `super_admin` e faz `profiles` upsert + `company_users` (is_owner) + `user_roles` (`company_admin`). Nenhuma mudança de banco é necessária.
- Antes de publicar: confirmar que a função `create-company-user` está ativa no ambiente de produção (VPS), já que é ela que executa a criação do acesso.

## Fora do escopo

Nada de pedidos, caixas, impressão, TEF/PinPad ou notas fiscais é tocado. Nenhuma loja existente é alterada.
