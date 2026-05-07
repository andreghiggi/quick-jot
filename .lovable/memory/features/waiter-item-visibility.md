---
name: Waiter Item Visibility
description: waiter_item boolean on products table to hide items from waiter/table module independently of PDV and menu
type: feature
---
- Column `waiter_item` (boolean, default true) on `products` table
- Mapped as `waiterItem` in Product type and useProducts hook
- Toggle "Item de Mesa/Garçom" shown in Products page when `tables` module is enabled
- Waiter.tsx filters by `p.waiterItem !== false`
- Independent of `pdvItem` (PDV/Express) and `menuItem` (cardápio online)
