# Corrigir o login (Rei do Açaí e demais lojas)

## O que está acontecendo

Na última rodada de ajustes foi adicionado, no arquivo de abertura do site, um trecho que apaga dados de sessão antigos gravados no navegador. Esse trecho apaga justamente a chave de sessão que este aplicativo usa hoje.

Resultado: toda vez que a página carrega, a sessão recém-criada é apagada. A pessoa digita e-mail e senha, o acesso é aceito, e na sequência ela é devolvida para a tela de entrar. É por isso que ninguém consegue mais entrar.

Confirmação: o endereço de banco configurado no aplicativo é exatamente o mesmo que o trecho de limpeza tenta remover.

## Correção

Remover o trecho de limpeza de sessão do arquivo de abertura. Nada mais é alterado.

Isso não afeta cardápio público, impressão, fiscal, TEF ou banco de dados.

## Detalhes técnicos

- Arquivo: `index.html`, bloco `<script>` inicial que percorre o `localStorage` e remove chaves contendo `iwmrtxdzlkasuzutxvhh` / com prefixo `sb-iwmrtx`.
- `.env` atual: `VITE_SUPABASE_PROJECT_ID="iwmrtxdzlkasuzutxvhh"`, ou seja, o token de sessão do Supabase é gravado como `sb-iwmrtxdzlkasuzutxvhh-auth-token` — apagado a cada carregamento.
- Ação: excluir esse bloco inteiro. O redirect de domínio legado logo abaixo permanece intacto.
- Verificação: build limpo e teste de login em `/auth` no preview, confirmando que a sessão persiste após recarregar.

## Depois

Publicar para que a produção volte a permitir login.
