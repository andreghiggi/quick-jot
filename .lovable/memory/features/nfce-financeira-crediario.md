---
name: NFC-e financeira de crediário
description: Padrão fiscal autoritativo para recebimento de crediário financeiro CRED-* aceito pela Fiscal Flow
type: feature
---
NFC-e financeira de crediário (external_id `CRED-*` de recebimento financeiro) deve manter o padrão homologado da Cozinha da Ruiva: modelo 65, CFOP 5949, CSOSN 900, PIS/COFINS CST 49, alíquotas 0 e `cClassTrib/classTrib` 000001.

Não enviar aliases diretos de XML no item financeiro (`vBC`, `pICMS`, `vICMS`, `pPIS`, `vPIS`, `pCOFINS`, `vCOFINS`, bases PIS/COFINS/ICMS ou tags ST/CEST). A Fiscal Flow/API2 já omite ICMS/ST para CSOSN 900 zerado e monta PIS/COFINS; aliases manuais causam XML inválido (`PISOutr/COFINSOutr`).

NFC-e financeira não movimenta estoque/faturamento; reprocessamento deve acontecer exclusivamente pelo Monitor NFC-e.

Para NFC-e financeira `CRED-*` já rejeitada, o Monitor deve atualizar a própria nota na Fiscal Flow/API2 antes de chamar reprocessamento: fazer `PUT /nfce-api/{id}` com o item corrigido e só depois chamar `/reprocessar`. O `/reprocessar` sozinho reaproveita o payload/XML salvo no provider e mantém CSOSN/CST antigos. Nunca criar `external_id` novo para corrigir CRED rejeitada sem autorização explícita, pois consome nova numeração.