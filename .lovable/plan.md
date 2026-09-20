# Tela branca na Bon Appetit — diagnosticar e proteger, sem afetar as outras lojas

## Escopo

- Loja afetada: **Lancheria Bon Appetit** (`32b71649-461d-4cb6-b26c-12390b090feb`).
- Nenhum dado será apagado ou alterado em massa.
- Nenhuma outra loja será parada, alterada ou publicada por causa desta correção.

## O que já está confirmado agora

- O site `app.comandatech.com.br` responde e a tela de login carrega normalmente (versão publicada 1.71.5-beta, anterior aos ajustes de hoje).
- O servidor das lojas responde a login, dados e cardápio nas verificações feitas.
- Nenhum erro de JavaScript apareceu nas telas públicas testadas.
- Logo, a tela branca **não** está na abertura do site e **não** foi causada por publicação de hoje.

O ponto exato da tela branca na Bon Appetit ainda não está confirmado. A primeira etapa é justamente identificar isso sem alterar nada.

## Etapa 1 — Reproduzir e localizar (somente leitura)

- Reproduzir a tela branca com um acesso real da Bon Appetit, observando o que o sistema tenta carregar naquele instante.
- Registrar: tela em que ocorre, se é antes ou depois de entrar, horário, se recarregar resolve e se ocorre em outro aparelho.
- Conferir, apenas lendo, a configuração da Bon Appetit: vínculo de usuário e empresa, módulos ativos, situação da licença e configurações de loja.
- Comparar com uma loja que está funcionando, para isolar o que é específico dessa loja.

**Saída:** causa comprovada, não suposição. Enquanto isso, nada é alterado.

## Etapa 2 — Proteger contra tela branca (melhoria geral e segura)

Hoje existem pontos do sistema que não mostram nada enquanto uma verificação de acesso não responde. Se o servidor demorar, o resultado é tela branca sem mensagem nem saída.

Ajustes previstos:

- Substituir as telas vazias por indicador de carregamento nos pontos de verificação de acesso.
- Aplicar limite de espera: se a verificação não responder a tempo, o sistema continua e avisa, em vez de ficar branco.
- Exibir mensagem clara com opção de tentar novamente quando a consulta falhar.
- Registrar o motivo para diagnóstico rápido em atendimento.

Isso não muda regras de venda, caixa, cardápio, impressão, TEF ou fiscal, e não altera dados de nenhuma loja.

## Etapa 3 — Corrigir a causa da Bon Appetit

- Aplicar a correção específica encontrada na Etapa 1, restrita à Bon Appetit.
- Se for configuração da loja, ajustar apenas os campos divergentes, com comparação antes e depois.
- Nenhum acerto retroativo de vendas, caixas, notas ou filas de impressão.

## Etapa 4 — Validar e liberar

- Validar na Bon Appetit: entrada, cardápio, pedidos, impressão, caixa e pagamento, acompanhando a operação real.
- Publicar com verificação automática e retorno imediato à versão anterior se o teste falhar, evitando impacto nas demais lojas.
- Registrar a correção em **Novidades**.

## Regras de segurança

- Nenhum dado apagado, redefinido ou substituído.
- Nenhuma nota fiscal emitida, reemitida, cancelada ou inutilizada.
- Nenhuma cobrança TEF de teste; TEF/PinPad permanece congelado.
- Ajustes restritos à Bon Appetit; demais lojas seguem operando sem interrupção.

## Informação que acelera o diagnóstico

Se possível, diga se a tela branca na Bon Appetit aparece antes ou depois de entrar com usuário e senha, e se recarregar a página resolve por algum tempo.
