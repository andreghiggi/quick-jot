---
name: NFC-e financeira de crediário
description: Padrão fiscal autoritativo para recebimento de crediário financeiro CRED-* aceito pela Fiscal Flow
type: feature
---
NFC-e financeira de crediário (external_id `CRED-*` de recebimento financeiro) deve manter o padrão homologado da Cozinha da Ruiva: modelo 65, CFOP 5949, CSOSN 900, PIS/COFINS CST 49, alíquotas 0 e `cClassTrib/classTrib` 000001.

Não enviar aliases diretos de XML no item financeiro (`vBC`, `pICMS`, `vICMS`, `pPIS`, `vPIS`, `pCOFINS`, `vCOFINS`, bases PIS/COFINS/ICMS ou tags ST/CEST). A Fiscal Flow/API2 já omite ICMS/ST para CSOSN 900 zerado e monta PIS/COFINS; aliases manuais causam XML inválido (`PISOutr/COFINSOutr`).

NFC-e financeira não movimenta estoque/faturamento; reprocessamento deve acontecer exclusivamente pelo Monitor NFC-e.