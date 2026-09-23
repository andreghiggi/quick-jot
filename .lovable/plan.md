# Ajustes finos no recibo do Rei do Açaí

Aplicar somente ao recibo V2 rico de 58 mm usado pelo Rei do Açaí, mantendo pedidos, pagamentos, caixa, TEF e documentos fiscais intactos.

## Ajustes do layout

1. Manter **“PEDIDO EXPRESS” em uma única linha**, sem o ícone que hoje reduz o espaço disponível.
2. Desenhar um **box retangular em linha grossa** ao redor de todo o cabeçalho, incluindo:
   - nome da loja;
   - número do pedido;
   - origem “PEDIDO EXPRESS”;
   - data e hora;
   - “Pronto até”;
   - cliente, telefone e pagamento.
3. Manter **“Pronto até: 23:39” em uma única linha**, com tamanho compatível com 58 mm.
4. Imprimir os **nomes dos grupos de adicionais sublinhados**, preservando o marcador quadrado e a capitalização original.
5. Reservar colunas fixas para totais, deixando **“Subtotal:” à esquerda e “R$ 26,00” à direita**, sem sobreposição.
6. Imprimir **“Obs: ...” em faixa invertida**, com fundo preto e texto branco.
7. Corrigir a separação dos adicionais para que respostas com vírgula no próprio nome sejam tratadas como um único item; **“Sim, preciso” sairá como “+ SIM, PRECISO”**, com apenas um sinal de mais.

## Implementação e validação

- Ajustar o gerador do recibo para emitir informações sem ícones e preservar adicionais compostos.
- Ajustar o programa de impressão para reconhecer os limites do cabeçalho, desenhar o box e aplicar sublinhado/área invertida no modo gráfico do Windows.
- Replicar o programa atualizado no arquivo baixado pelo painel e subir sua versão.
- Gerar uma prévia técnica em 58 mm com os mesmos casos da foto e conferir: nenhuma quebra em “Pedido Express” e “Pronto até”, box fechado até o cliente, grupos sublinhados, subtotal sem colisão, observação invertida e “+ SIM, PRECISO”.
- Registrar a correção na versão do sistema e no menu **Novidades**.

## Segurança do escopo

- Alteração isolada ao layout V2 rico do Rei do Açaí durante a validação.
- Não reenfileirar nem reimprimir pedidos existentes durante o teste.
- Não alterar TEF, PinPad, NFC-e, numeração fiscal, caixa ou dados de pedidos.
