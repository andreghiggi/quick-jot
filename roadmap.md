# Roadmap — Retomada ComandaTech

- [x] Preparar acionamento único 21/09/2026 00:00 BRT (somente diagnóstico + cópia de retorno do frontend)
- [x] Fixar uma única configuração de produção (publicação e validação usam só api.comandatech.com.br)
- [x] Retorno automático para a versão anterior se o teste após publicação falhar
- [x] Instaladores de impressão alinhados ao endereço de produção (ajustável por loja)
- [x] Versão 1.72.0-beta registrada em Novidades
- [x] Proteção independente contra tela branca e recuperação de arquivos antigos (1.72.3-beta)
- [x] Corrigir abertura do PDV no Safari/iPhone sem carregamento separado (1.72.4-beta)
- [x] Corrigir queda da Dashboard por pedido cancelado sem aparência definida (1.72.5-beta)
- [ ] Confirmar acesso efetivo à VPS (chave SSH não disponível nesta sessão) — bloqueado
- [ ] Inventário por loja e correção de divergências (etapa 4) — depende do acesso
- [ ] Piloto Lancheria da I9 (etapa 5) — depende do acesso e do responsável da loja
- [ ] Liberação gradual das demais lojas (etapa 6)
- [ ] Estabilização, contingência e relatório final (etapas 7-8)
- [ ] Validar impressão física piloto: Rei do Açaí com recibo V39 sem comanda; Bon Appetit com recibo + comanda — código validado, aguarda publicação e teste autorizado
- [x] Ajustar os sete detalhes visuais do recibo V39 do Rei do Açaí no programa v1.8.6; validação física ainda depende da loja
- [x] Ajustar separação entre produtos, troco e subtotal redundante no recibo do Rei do Açaí (sistema 1.74.11-beta / impressor 1.8.7); validação física ainda depende da loja
- [ ] Após validação física dos pilotos, liberar recibo obrigatório independente da comanda para as demais lojas

## Comanda individual (piloto I9) — plano v3.1 aprovado
- [ ] Banco: comanda_number, lista liberada, opção, reservas de fração, cobranças, funções com trava no servidor
- [ ] Opção nas configurações de Mesas (só lojas da lista)
- [ ] Garçom: número da comanda digitado ou lido pela câmera
- [ ] QR da mesa: número da comanda (só comanda aberta na mesma mesa; senão pendente)
- [ ] Janela "Cobrar Comanda" (várias comandas + importar fração) no Frente de Caixa / Mesas PDV V2
- [ ] Novidades + versão
- [ ] Espelhar banco na VPS antes de publicar — bloqueado: sem acesso à VPS nesta sessão
- [ ] Confirmar formato do código do cartão (leitura real) — aguarda usuário
- [ ] Decisões: frações, taxa de serviço, tempos — aguarda usuário

### Comanda individual — status da UI (piloto I9)
- [x] Opção nas configurações de Mesas (só lojas liberadas)
- [x] Garçom: número da comanda digitado ou pela câmera; transferência entre mesas
- [x] QR da mesa: campo do número da comanda (trava no servidor)
- [x] Cobrança: Frente de Caixa (menu lateral) e PDV V2 (lojas sem Frente de Caixa), várias comandas + importar 1/2, 1/4, 1/5, 1/8, 1/10
- [ ] Teste real na I9 (ligar a opção e testar com cartões) — aguarda usuário
- [ ] Espelhar banco e função do QR na VPS antes de publicar — sem acesso à VPS nesta sessão
- [ ] Novidades + versão 1.76.0-beta
