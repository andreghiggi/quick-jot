# Fotos novas não aparecem em categorias, subcategorias e produtos

## O que está acontecendo

O envio da foto funciona: o arquivo sai do computador, o sistema aceita e salva o endereço da imagem. O que falha é a **entrega da imagem depois de salva** — por isso parece que salvou, mas a foto não aparece. Afeta todas as lojas e só o ambiente dos clientes (app.comandatech.com.br), não o editor.

## Causa provável (a confirmar no servidor antes de mexer)

No servidor de produção existe um atalho: as imagens públicas são lidas direto de uma pasta do disco, em vez de passarem pelo serviço de arquivos do sistema. Esse atalho só acerta o caminho das fotos antigas. As fotos enviadas agora são gravadas em um caminho diferente (com uma subpasta de versão), então o atalho não encontra o arquivo e devolve "não existe" — a foto fica quebrada ou continua mostrando a versão antiga.

Isso também explica o caso em que a loja troca a foto e continua vendo a anterior.

## Etapas

1. **Confirmar no servidor (somente leitura)**
   - Listar a pasta das imagens e comparar o caminho de um arquivo antigo com o de um enviado hoje.
   - Abrir no navegador o endereço de uma foto nova e ver a resposta (não existe / sem permissão / ok).
   - Só seguir para o passo 2 se a listagem confirmar a causa acima. Se a resposta for outra (por exemplo permissão negada), corrigir a permissão em vez do caminho.

2. **Corrigir a entrega das imagens**
   - Remover o atalho de disco e deixar as imagens públicas passarem pelo serviço de arquivos do sistema, que sabe resolver qualquer caminho, antigo ou novo.
   - Manter o cache no navegador e as permissões de origem como estão hoje, para não deixar o cardápio mais lento.
   - Recarregar a configuração do servidor sem reiniciar nada do sistema.

3. **Melhorar o aviso na tela (frontend)**
   - Hoje, quando algo falha no envio, a tela mostra apenas "Erro ao enviar imagem" e o motivo real fica escondido. Passar o motivo real para a mensagem, nas telas de categorias, subcategorias, produtos e combos.
   - Confirmar a foto após salvar: se a imagem gravada não abrir, avisar na hora em vez de deixar o gerente achar que salvou.

4. **Validar**
   - Enviar uma foto nova em uma categoria, uma subcategoria e um produto, e conferir que aparecem no painel e no cardápio público.
   - Conferir que as fotos antigas continuam aparecendo.
   - Repetir a troca da mesma foto para confirmar que a nova substitui a anterior.

## O que não será tocado

Pedidos, vendas, caixas, impressão, TEF/PinPad, notas fiscais e dados de qualquer loja. Nenhuma imagem existente será apagada.

## Detalhes técnicos

- `deploy/nginx/api.comandatech.com.br.conf`: a `location ~ ^/storage/v1/object/public/product-images/(.+)$` usa `alias .../supabase/data/storage/stub/stub/product-images/$1`. O backend de arquivos do storage-api grava objetos em `<bucket>/<key>/<version>`, então o alias só resolve arquivos do layout antigo. Remover esse bloco e deixar cair no `location /storage/v1/` (proxy para 127.0.0.1:54323), acrescentando `proxy_cache`/`Cache-Control` equivalente e mantendo `Cross-Origin-Resource-Policy: cross-origin`.
- Verificação no servidor: `ls -R /opt/apps/comandatech-api/supabase/data/storage/stub/stub/product-images | head` e `curl -I https://api.comandatech.com.br/storage/v1/object/public/product-images/<arquivo-novo>`.
- Conferir também `storage.buckets` na base da VPS: `product-images` precisa estar com `public = true`.
- Frontend: `src/utils/imageUtils.ts` (`uploadCompressedImage`) engole o erro e retorna `null`; passar a propagar a mensagem do storage; ajustar os `catch` em `Categories.tsx`, `Subcategories.tsx`, `ProductEdit.tsx`, `Products.tsx`, `ComboEdit.tsx`, `OptionalGroups.tsx` e `Settings.tsx` para exibi-la.
- Publicação: build + deploy pelo fluxo atual (deploy-vps.yml), com rollback automático. A mudança do nginx é aplicada no servidor e não altera banco.
