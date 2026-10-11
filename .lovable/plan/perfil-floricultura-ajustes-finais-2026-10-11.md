# Perfil Floricultura — ajustes finais

As logos enviadas servem só para conferir a cor. Elas não aparecem em nenhuma tela. O verde escuro da logo (aprox. #023C1A) continua sendo a cor do perfil Floricultura.

## O que será feito
1. **Cor só para floriculturas**: o verde aparece somente nas lojas com o módulo Floricultura ligado. Restaurantes continuam com o vermelho de hoje.
2. **Erros e cancelamentos continuam vermelhos**, também nas floriculturas.
3. **Catálogo online**: nas floriculturas, a palavra "Cardápio" vira "Catálogo". Os links continuam os mesmos (/cardapio/...).
4. **Cor escolhida pela loja**: se a floricultura salvou uma cor própria no catálogo, essa cor vale no lugar do verde.
5. **Conferência**: comparar uma loja de restaurante com uma floricultura de teste e confirmar que o restaurante não mudou.

## Proteções
- O módulo fica desligado para todas as lojas. Nenhuma empresa será ativada sem sua autorização.
- Pedidos, PDV, fiscal, TEF, impressão e financeiro não serão alterados.
- Nada será registrado em Novidades e nada será publicado sem uma ordem sua.

## Detalhes técnicos
- `CompanyProfileTheme`: limitar a troca de cor ao perfil ativo, restaurar os valores anteriores ao desligar ou trocar de empresa e conferir o modo escuro e as janelas abertas por cima da tela.
- `Menu.tsx` / `MenuV2.tsx`: a cor salva pela loja tem prioridade; o verde só substitui o vermelho padrão.
- `AppSidebar.tsx`: mover os hooks para antes do retorno antecipado do Super Admin.
- RPC pública `is_company_module_enabled`: limitar a consulta ao módulo `floricultura`.
- Rodar novamente os testes de regressão (restaurante e floricultura) e a checagem de tipos.
