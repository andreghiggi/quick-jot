export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      business_hours: {
        Row: {
          always_open: boolean
          close_time: string | null
          company_id: string
          created_at: string
          day_of_week: number
          id: string
          is_open: boolean
          open_time: string | null
          period_number: number | null
          updated_at: string
        }
        Insert: {
          always_open?: boolean
          close_time?: string | null
          company_id: string
          created_at?: string
          day_of_week: number
          id?: string
          is_open?: boolean
          open_time?: string | null
          period_number?: number | null
          updated_at?: string
        }
        Update: {
          always_open?: boolean
          close_time?: string | null
          company_id?: string
          created_at?: string
          day_of_week?: number
          id?: string
          is_open?: boolean
          open_time?: string | null
          period_number?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_amount: number | null
          company_id: string
          created_at: string | null
          difference: number | null
          expected_amount: number | null
          id: string
          notes: string | null
          opened_at: string | null
          opened_by: string
          opening_amount: number
          status: string
          updated_at: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          company_id: string
          created_at?: string | null
          difference?: number | null
          expected_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string | null
          opened_by: string
          opening_amount?: number
          status?: string
          updated_at?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          company_id?: string
          created_at?: string | null
          difference?: number | null
          expected_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string | null
          opened_by?: string
          opening_amount?: number
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean | null
          animated: boolean
          company_id: string | null
          created_at: string
          display_order: number | null
          emoji: string | null
          id: string
          image_url: string | null
          name: string
        }
        Insert: {
          active?: boolean | null
          animated?: boolean
          company_id?: string | null
          created_at?: string
          display_order?: number | null
          emoji?: string | null
          id?: string
          image_url?: string | null
          name: string
        }
        Update: {
          active?: boolean | null
          animated?: boolean
          company_id?: string | null
          created_at?: string
          display_order?: number | null
          emoji?: string | null
          id?: string
          image_url?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          active: boolean | null
          address: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_reference: string | null
          address_street: string | null
          cnpj: string | null
          created_at: string | null
          id: string
          initial_password: string | null
          login_email: string | null
          logo_url: string | null
          name: string
          phone: string | null
          reseller_id: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_reference?: string | null
          address_street?: string | null
          cnpj?: string | null
          created_at?: string | null
          id?: string
          initial_password?: string | null
          login_email?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          reseller_id?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_reference?: string | null
          address_street?: string | null
          cnpj?: string | null
          created_at?: string | null
          id?: string
          initial_password?: string | null
          login_email?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          reseller_id?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      company_modules: {
        Row: {
          company_id: string
          created_at: string | null
          enabled: boolean | null
          id: string
          module_name: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          module_name: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          module_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_modules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_plans: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          active: boolean
          company_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          plan_name: string
          starts_at: string
          updated_at: string | null
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          active?: boolean
          company_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          plan_name?: string
          starts_at?: string
          updated_at?: string | null
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          active?: boolean
          company_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          plan_name?: string
          starts_at?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_users: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          is_owner: boolean | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          is_owner?: boolean | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          is_owner?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          birth_date: string | null
          city: string | null
          company_id: string | null
          cpf: string | null
          created_at: string
          id: string
          name: string
          phone: string
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          city?: string | null
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          id?: string
          name: string
          phone: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          city?: string | null
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_neighborhoods: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          delivery_fee: number
          id: string
          neighborhood_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          delivery_fee?: number
          id?: string
          neighborhood_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          delivery_fee?: number
          id?: string
          neighborhood_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_neighborhoods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      nfce_records: {
        Row: {
          ambiente: string | null
          chave_acesso: string | null
          company_id: string
          created_at: string
          external_id: string
          id: string
          motivo_rejeicao: string | null
          nfce_id: string | null
          numero: string | null
          protocolo: string | null
          qrcode_url: string | null
          request_payload: Json | null
          response_payload: Json | null
          sale_id: string | null
          serie: string | null
          status: string
          updated_at: string
          valor_total: number
          webhook_payload: Json | null
          xml_url: string | null
        }
        Insert: {
          ambiente?: string | null
          chave_acesso?: string | null
          company_id: string
          created_at?: string
          external_id: string
          id?: string
          motivo_rejeicao?: string | null
          nfce_id?: string | null
          numero?: string | null
          protocolo?: string | null
          qrcode_url?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          sale_id?: string | null
          serie?: string | null
          status?: string
          updated_at?: string
          valor_total?: number
          webhook_payload?: Json | null
          xml_url?: string | null
        }
        Update: {
          ambiente?: string | null
          chave_acesso?: string | null
          company_id?: string
          created_at?: string
          external_id?: string
          id?: string
          motivo_rejeicao?: string | null
          nfce_id?: string | null
          numero?: string | null
          protocolo?: string | null
          qrcode_url?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          sale_id?: string | null
          serie?: string | null
          status?: string
          updated_at?: string
          valor_total?: number
          webhook_payload?: Json | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfce_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfce_records_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pdv_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      optional_group_categories: {
        Row: {
          category_id: string
          group_id: string
          id: string
        }
        Insert: {
          category_id: string
          group_id: string
          id?: string
        }
        Update: {
          category_id?: string
          group_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "optional_group_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "optional_group_categories_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "optional_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      optional_group_items: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          display_order: number | null
          group_id: string
          id: string
          image_url: string | null
          name: string
          price: number
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          display_order?: number | null
          group_id: string
          id?: string
          image_url?: string | null
          name: string
          price?: number
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          display_order?: number | null
          group_id?: string
          id?: string
          image_url?: string | null
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "optional_group_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "optional_group_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "optional_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      optional_group_products: {
        Row: {
          group_id: string
          id: string
          max_select_override: number | null
          min_select_override: number | null
          product_id: string
        }
        Insert: {
          group_id: string
          id?: string
          max_select_override?: number | null
          min_select_override?: number | null
          product_id: string
        }
        Update: {
          group_id?: string
          id?: string
          max_select_override?: number | null
          min_select_override?: number | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "optional_group_products_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "optional_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "optional_group_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      optional_groups: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          display_order: number | null
          id: string
          layout: string
          max_select: number
          min_select: number
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          display_order?: number | null
          id?: string
          layout?: string
          max_select?: number
          min_select?: number
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          display_order?: number | null
          id?: string
          layout?: string
          max_select?: number
          min_select?: number
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "optional_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          order_id: string
          price: number
          product_id: string | null
          quantity: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          order_id: string
          price: number
          product_id?: string | null
          quantity?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          order_id?: string
          price?: number
          product_id?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          company_id: string | null
          confirmed_at: string | null
          created_at: string
          customer_name: string
          customer_phone: string | null
          daily_number: number | null
          delivery_address: string | null
          followup_sent: boolean
          id: string
          notes: string | null
          order_code: string
          printed: boolean | null
          printed_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          total: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          daily_number?: number | null
          delivery_address?: string | null
          followup_sent?: boolean
          id?: string
          notes?: string | null
          order_code?: string
          printed?: boolean | null
          printed_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total?: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          daily_number?: number | null
          delivery_address?: string | null
          followup_sent?: boolean
          id?: string
          notes?: string | null
          order_code?: string
          printed?: boolean | null
          printed_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          active: boolean | null
          company_id: string
          created_at: string | null
          display_order: number | null
          id: string
          name: string
          pix_key: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          company_id: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
          pix_key?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          company_id?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
          pix_key?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_sale_items: {
        Row: {
          created_at: string | null
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          product_name: string
          quantity?: number
          sale_id: string
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pdv_sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pdv_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_sales: {
        Row: {
          cash_register_id: string
          company_id: string
          created_at: string | null
          created_by: string
          customer_name: string | null
          discount: number | null
          final_total: number
          id: string
          notes: string | null
          payment_method_id: string | null
          total: number
        }
        Insert: {
          cash_register_id: string
          company_id: string
          created_at?: string | null
          created_by: string
          customer_name?: string | null
          discount?: number | null
          final_total?: number
          id?: string
          notes?: string | null
          payment_method_id?: string | null
          total?: number
        }
        Update: {
          cash_register_id?: string
          company_id?: string
          created_at?: string | null
          created_by?: string
          customer_name?: string | null
          discount?: number | null
          final_total?: number
          id?: string
          notes?: string | null
          payment_method_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "pdv_sales_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_sales_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      product_optionals: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          id: string
          name: string
          price: number
          product_id: string
          type: string
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          name: string
          price?: number
          product_id: string
          type: string
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          name?: string
          price?: number
          product_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_optionals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_optionals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category: string
          company_id: string | null
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          image_url: string | null
          is_new: boolean
          name: string
          pdv_item: boolean
          price: number
          tax_rule_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_new?: boolean
          name: string
          pdv_item?: boolean
          price: number
          tax_rule_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_new?: boolean
          name?: string
          pdv_item?: boolean
          price?: number
          tax_rule_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tax_rule_id_fkey"
            columns: ["tax_rule_id"]
            isOneToOne: false
            referencedRelation: "tax_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      reseller_companies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          reseller_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          reseller_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          reseller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_companies_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_invoice_items: {
        Row: {
          company_id: string | null
          company_name: string
          created_at: string
          days_counted: number | null
          id: string
          invoice_id: string
          type: string
          value: number
        }
        Insert: {
          company_id?: string | null
          company_name: string
          created_at?: string
          days_counted?: number | null
          id?: string
          invoice_id: string
          type: string
          value?: number
        }
        Update: {
          company_id?: string | null
          company_name?: string
          created_at?: string
          days_counted?: number | null
          id?: string
          invoice_id?: string
          type?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "reseller_invoice_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "reseller_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_invoices: {
        Row: {
          created_at: string
          due_date: string
          id: string
          month: string
          paid_at: string | null
          payment_method: string | null
          reseller_id: string
          status: string
          total_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_date: string
          id?: string
          month: string
          paid_at?: string | null
          payment_method?: string | null
          reseller_id: string
          status?: string
          total_value?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_date?: string
          id?: string
          month?: string
          paid_at?: string | null
          payment_method?: string | null
          reseller_id?: string
          status?: string
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_invoices_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_settings: {
        Row: {
          activation_fee: number
          asaas_api_key: string | null
          created_at: string
          id: string
          invoice_due_day: number
          monthly_fee: number
          reseller_id: string
          updated_at: string
        }
        Insert: {
          activation_fee?: number
          asaas_api_key?: string | null
          created_at?: string
          id?: string
          invoice_due_day?: number
          monthly_fee?: number
          reseller_id: string
          updated_at?: string
        }
        Update: {
          activation_fee?: number
          asaas_api_key?: string | null
          created_at?: string
          id?: string
          invoice_due_day?: number
          monthly_fee?: number
          reseller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_settings_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: true
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      resellers: {
        Row: {
          address_cep: string | null
          address_city: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          cnpj: string | null
          created_at: string
          created_by: string
          email: string
          id: string
          name: string
          phone: string | null
          responsible_email: string | null
          responsible_name: string | null
          responsible_phone: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_cep?: string | null
          address_city?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          cnpj?: string | null
          created_at?: string
          created_by: string
          email: string
          id?: string
          name: string
          phone?: string | null
          responsible_email?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_cep?: string | null
          address_city?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          responsible_email?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestions: {
        Row: {
          admin_notes: string | null
          company_id: string
          created_at: string
          description: string
          expected_date: string | null
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          company_id: string
          created_at?: string
          description: string
          expected_date?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          company_id?: string
          created_at?: string
          description?: string
          expected_date?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_items: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          notes: string | null
          product_id: string | null
          product_name: string
          quantity: number
          tab_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          tab_id: string
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          tab_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_items_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          capacity: number | null
          company_id: string
          created_at: string | null
          id: string
          number: number
          status: Database["public"]["Enums"]["table_status"]
          updated_at: string | null
        }
        Insert: {
          capacity?: number | null
          company_id: string
          created_at?: string | null
          id?: string
          number: number
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string | null
        }
        Update: {
          capacity?: number | null
          company_id?: string
          created_at?: string | null
          id?: string
          number?: number
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tables_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tabs: {
        Row: {
          closed_at: string | null
          company_id: string
          created_at: string | null
          created_by: string
          customer_name: string | null
          id: string
          notes: string | null
          status: string
          tab_number: number
          table_id: string | null
          updated_at: string | null
        }
        Insert: {
          closed_at?: string | null
          company_id: string
          created_at?: string | null
          created_by: string
          customer_name?: string | null
          id?: string
          notes?: string | null
          status?: string
          tab_number: number
          table_id?: string | null
          updated_at?: string | null
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string
          customer_name?: string | null
          id?: string
          notes?: string | null
          status?: string
          tab_number?: number
          table_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tabs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tabs_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rules: {
        Row: {
          active: boolean
          cest: string | null
          cfop: string
          cofins_aliquot: number
          cofins_cst: string
          company_id: string
          created_at: string
          csosn: string
          description: string | null
          icms_aliquot: number
          icms_origin: string
          id: string
          ipi_aliquot: number
          ipi_cst: string
          name: string
          ncm: string
          pis_aliquot: number
          pis_cst: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cest?: string | null
          cfop: string
          cofins_aliquot?: number
          cofins_cst?: string
          company_id: string
          created_at?: string
          csosn: string
          description?: string | null
          icms_aliquot?: number
          icms_origin?: string
          id?: string
          ipi_aliquot?: number
          ipi_cst?: string
          name: string
          ncm: string
          pis_aliquot?: number
          pis_cst?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cest?: string | null
          cfop?: string
          cofins_aliquot?: number
          cofins_cst?: string
          company_id?: string
          created_at?: string
          csosn?: string
          description?: string | null
          icms_aliquot?: number
          icms_origin?: string
          id?: string
          ipi_aliquot?: number
          ipi_cst?: string
          name?: string
          ncm?: string
          pis_aliquot?: number
          pis_cst?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waiters: {
        Row: {
          active: boolean | null
          company_id: string
          created_at: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          company_id: string
          created_at?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_auto_reply_locks: {
        Row: {
          company_id: string
          created_at: string
          id: string
          phone: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          phone: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          phone?: string
        }
        Relationships: []
      }
      whatsapp_instances: {
        Row: {
          company_id: string
          created_at: string
          id: string
          instance_id: string | null
          instance_name: string
          phone_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name: string
          phone_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name?: string
          phone_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          company_id: string
          created_at: string
          id: string
          message: string
          order_id: string | null
          phone: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          message: string
          order_id?: string | null
          phone: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          message?: string
          order_id?: string | null
          phone?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_next_daily_order_number: { Args: never; Returns: number }
      get_reseller_id: { Args: { _user_id: string }; Returns: string }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "reseller"
        | "company_admin"
        | "company_user"
        | "waiter"
      order_status: "pending" | "preparing" | "ready" | "delivered"
      table_status: "available" | "occupied" | "reserved"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "reseller",
        "company_admin",
        "company_user",
        "waiter",
      ],
      order_status: ["pending", "preparing", "ready", "delivered"],
      table_status: ["available", "occupied", "reserved"],
    },
  },
} as const
