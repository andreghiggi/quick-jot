# Tela branca no site das lojas — diagnosticar e proteger

## O que já está confirmado agora

- O site `app.comandatech.com.br` responde e a tela de login carrega normalmente (versão publicada 1.71.5-beta, anterior aos ajustes de hoje).
- O servidor das lojas responde: login, dados e cardápio atendem às chamadas de verificação.
- Nenhum erro de JavaScript apareceu nas telas públicas testadas.
- Portanto, a tela branca **não** está na abertura do site nem foi causada pela publicação de hoje.

O que ainda não está confirmado é em qual ponto a tela fica branca (após entrar, em uma loja específica, ou em uma tela interna). A primeira etapa do plano é justamente descobrir isso — sem alterar dados.

## Etapa 1 — Reproduzir e localizar (sem mudar nada)

- Reproduzir a tela branca com um acesso real de loja, acompanhando o que o sistema tenta carregar naquele momento.
- Registrar: loja, tela, horário, se acontece sempre ou de vez em quando, e se acontece em outros aparelhos/navegadores.
- Verificar se o servidor demora ou falha em alguma das consultas que a tela precisa para aparecer.

**Saída:** causa identificada com evidência, não suposição.

## Etapa 2 — Proteger contra tela branca (independe da causa)

Hoje o sistema tem pontos que mostram literalmente nada enquanto uma verificação não responde. Se o servidor demorar, o usuário vê tela branca sem mensagem nem saída.

Ajustes previstos:

- Trocar as telas vazias por indicador de carregamento em todos os pontos de bloqueio de acesso.
- Aplicar um limite de espera: se a verificação não responder a tempo, o sistema segue com a tela e avisa, em vez de ficar branco.
- Mostrar uma mensagem clara com botão "tentar de novo" quando a consulta falhar, em vez de tela vazia.
- Registrar o motivo no console para diagnóstico rápido em atendimento.

Nada disso muda regras de venda, caixa, cardápio, impressão, TEF ou fiscal.

## Etapa 3 — Corrigir a causa encontrada

Depois da Etapa 1, aplicar a correção específica, restrita à loja ou à tela afetada, com comparação antes/depois.

## Etapa 4 — Validar e publicar

- Testar em uma loja, confirmando entrada, cardápio, pedidos, caixa e impressão.
- Publicar com verificação automática e retorno imediato à versão anterior em caso de falha.
- Registrar a correção em **Novidades**.

## Regras de segurança

- Nenhum dado será apagado ou alterado em massa.
- Nenhuma nota fiscal será emitida, reemitida, cancelada ou inutilizada.
- Nenhuma cobrança TEF de teste será criada; TEF/PinPad permanece congelado.
- Cada mudança será validada antes de liberar para as demais lojas.

## Informação que acelera muito o diagnóstico

Se possível, informe: qual loja, se a tela branca aparece antes ou depois de entrar com usuário e senha, e se recarregar a página resolve temporariamente.
