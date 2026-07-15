
CREATE OR REPLACE FUNCTION public.import_purchase_invoice(
  _company_id uuid,
  _dfe_id uuid,
  _supplier_id uuid,
  _header jsonb,
  _xml_path text,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_factor numeric;
  v_stock_qty numeric;
  v_note text;
BEGIN
  IF NOT public.user_belongs_to_company(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta empresa';
  END IF;

  -- Bloqueia duplicidade pela chave de acesso
  IF (_header->>'chave') IS NOT NULL AND length(_header->>'chave') > 0 THEN
    IF EXISTS (SELECT 1 FROM public.purchase_invoices
               WHERE company_id = _company_id
                 AND chave_acesso = (_header->>'chave')) THEN
      RAISE EXCEPTION 'NF-e já importada (chave %)', _header->>'chave'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  INSERT INTO public.purchase_invoices (
    company_id, dfe_documento_id, supplier_id,
    chave_acesso, cnpj_emitente, nome_emitente,
    numero_nfe, serie, data_emissao, valor_total, xml_path, status
  ) VALUES (
    _company_id, _dfe_id, _supplier_id,
    _header->>'chave', _header->>'cnpj_emit', _header->>'nome_emit',
    _header->>'numero', _header->>'serie',
    NULLIF(_header->>'emissao','')::timestamptz,
    COALESCE((_header->>'valor_total')::numeric, 0),
    _xml_path, 'lancada'
  ) RETURNING id INTO v_invoice_id;

  v_note := 'NF-e ' || COALESCE(_header->>'numero','') || '/' || COALESCE(_header->>'serie','')
            || ' - ' || COALESCE(_header->>'nome_emit','');

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id','')::uuid;
    v_qty := COALESCE((v_item->>'quantidade')::numeric, 0);
    v_factor := COALESCE(NULLIF((v_item->>'conversion_factor')::numeric, 0), 1);
    v_stock_qty := v_qty * v_factor;

    INSERT INTO public.purchase_invoice_items (
      invoice_id, company_id, product_id,
      xml_codigo, xml_descricao, xml_ean, xml_ncm, xml_cfop, xml_unidade,
      quantidade, valor_unitario, valor_total,
      conversion_factor, stock_unit, sale_price, unit_weight_kg, stock_applied
    ) VALUES (
      v_invoice_id, _company_id, v_product_id,
      v_item->>'xml_codigo', v_item->>'xml_descricao', v_item->>'xml_ean',
      v_item->>'xml_ncm', v_item->>'xml_cfop', v_item->>'xml_unidade',
      v_qty,
      COALESCE((v_item->>'valor_unitario')::numeric, 0),
      COALESCE((v_item->>'valor_total')::numeric, 0),
      v_factor,
      v_item->>'stock_unit',
      NULLIF(v_item->>'sale_price','')::numeric,
      NULLIF(v_item->>'unit_weight_kg','')::numeric,
      v_product_id IS NOT NULL
    );

    IF v_product_id IS NOT NULL THEN
      PERFORM public.apply_stock_movement(
        v_product_id, v_stock_qty, 'manual_in',
        'purchase_invoice', v_invoice_id,
        v_note || CASE WHEN v_factor <> 1 THEN ' (fator ' || v_factor || ')' ELSE '' END
      );
    END IF;
  END LOOP;

  IF _dfe_id IS NOT NULL THEN
    UPDATE public.dfe_documentos
       SET imported_at = now(),
           imported_invoice_id = v_invoice_id
     WHERE id = _dfe_id;
  END IF;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_purchase_invoice(uuid, uuid, uuid, jsonb, text, jsonb) TO authenticated;
