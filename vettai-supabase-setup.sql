-- VETTAI: create academy + profile rows for new Supabase Auth signups.
-- Run once in Supabase Dashboard > SQL Editor before enabling academy self-signup.
-- Does not modify or replace existing organiser accounts or RLS policies.

CREATE OR REPLACE FUNCTION public.handle_new_vettai_academy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  new_academy_id uuid;
  academy_name text;
  master_name text;
  academy_phone text;
BEGIN
  academy_name := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'academy_name', ''), 'Academy pending details');
  master_name := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'master_name', ''), 'Master pending details');
  academy_phone := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'phone', ''), 'Not provided');

  INSERT INTO public.academies (academy_code, academy_name, master_name, phone, email, created_by)
  VALUES (
    'INS-' || upper(left(replace(NEW.id::text, '-', ''), 8)),
    academy_name,
    master_name,
    academy_phone,
    NEW.email,
    NEW.id
  )
  RETURNING id INTO new_academy_id;

  INSERT INTO public.profiles (id, role, academy_id)
  VALUES (NEW.id, 'academy', new_academy_id);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created_vettai_academy ON auth.users;
CREATE TRIGGER on_auth_user_created_vettai_academy
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_vettai_academy();
