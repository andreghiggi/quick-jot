-- Create plans table
CREATE TABLE public.company_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_name text NOT NULL DEFAULT 'trial',
  starts_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  active boolean NOT NULL DEFAULT false,
  activated_by uuid,
  activated_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.company_plans ENABLE ROW LEVEL SECURITY;

-- RLS policies for company_plans
CREATE POLICY "Company users can view own plan"
ON public.company_plans FOR SELECT
USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Super admins can manage all plans"
ON public.company_plans FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Update handle_new_user function to create company automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_company_id uuid;
  user_full_name text;
  company_slug text;
BEGIN
  -- Get full name from metadata
  user_full_name := COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email);
  
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, user_full_name);
  
  -- Check if company_name was provided in metadata (signup flow)
  IF NEW.raw_user_meta_data ->> 'company_name' IS NOT NULL THEN
    -- Generate slug from company name
    company_slug := lower(regexp_replace(NEW.raw_user_meta_data ->> 'company_name', '[^a-zA-Z0-9]', '-', 'g'));
    company_slug := regexp_replace(company_slug, '-+', '-', 'g');
    company_slug := trim(both '-' from company_slug);
    -- Add random suffix to ensure uniqueness
    company_slug := company_slug || '-' || substr(gen_random_uuid()::text, 1, 8);
    
    -- Create company
    INSERT INTO public.companies (name, slug, active)
    VALUES (NEW.raw_user_meta_data ->> 'company_name', company_slug, true)
    RETURNING id INTO new_company_id;
    
    -- Link user to company as owner
    INSERT INTO public.company_users (company_id, user_id, is_owner)
    VALUES (new_company_id, NEW.id, true);
    
    -- Assign company_admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'company_admin');
    
    -- Create inactive trial plan (to be activated by super_admin)
    INSERT INTO public.company_plans (company_id, plan_name, active)
    VALUES (new_company_id, 'trial', false);
  ELSE
    -- Default role for users without company
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'company_user');
  END IF;
  
  RETURN NEW;
END;
$$;