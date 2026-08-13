insert into store_settings (company_id, key, value)
values ('f5f9eec3-67bc-497a-88a6-ce41d3b15df8','printer_paper_size','58mm')
on conflict (company_id, key) do update set value = excluded.value;