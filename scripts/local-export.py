import os
import json
import psycopg2
import psycopg2.extras
from datetime import datetime

def run():
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        print("Missing SUPABASE_DB_URL")
        exit(1)

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        bundle = {
            "meta": {
                "version": "1.0",
                "exported_at": datetime.utcnow().isoformat() + "Z",
                "source_project": "iwmrtxdzlkasuzutxvhh",
                "description": "Bundle login ComandaTech"
            },
            "counts": {},
            "auth": {},
            "public": {},
            "validation": {}
        }

        tables = [
            "companies", "profiles", "user_roles", "company_users",
            "resellers", "reseller_settings", "reseller_companies",
            "company_modules", "company_plans", "store_settings"
        ]

        # Auth Users
        cur.execute("SELECT * FROM auth.users")
        auth_users = cur.fetchall()
        for u in auth_users:
            for k, v in u.items():
                if isinstance(v, datetime): u[k] = v.isoformat()
        bundle["auth"]["users"] = auth_users
        bundle["counts"]["auth.users"] = len(auth_users)

        # Auth Identities
        cur.execute("SELECT * FROM auth.identities")
        auth_identities = cur.fetchall()
        for i in auth_identities:
            for k, v in i.items():
                if isinstance(v, datetime): i[k] = v.isoformat()
        bundle["auth"]["identities"] = auth_identities
        bundle["counts"]["auth.identities"] = len(auth_identities)

        # Public Tables
        for table in tables:
            cur.execute(f'SELECT * FROM public."{table}"')
            rows = cur.fetchall()
            for r in rows:
                for k, v in r.items():
                    if isinstance(v, datetime): r[k] = v.isoformat()
                if table == "reseller_settings":
                    r["asaas_api_key"] = None
            bundle["public"][table] = rows
            bundle["counts"][f"public.{table}"] = len(rows)

        # Validations
        cur.execute("SELECT count(*) FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)")
        bundle["validation"]["profiles_without_auth_user"] = cur.fetchone()["count"]

        cur.execute("SELECT count(*) FROM public.company_users cu WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = cu.user_id)")
        bundle["validation"]["company_users_without_auth_user"] = cur.fetchone()["count"]

        cur.execute("""
            SELECT u.email FROM auth.users u
            JOIN public.user_roles ur ON ur.user_id = u.id
            WHERE ur.role IN ('company_admin','company_user')
              AND NOT EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.user_id = u.id)
        """)
        bundle["validation"]["admins_without_company_users"] = [r["email"] for r in cur.fetchall()]

        cur.execute("""
            SELECT u.email FROM auth.users u
            JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'reseller'
            WHERE NOT EXISTS (SELECT 1 FROM public.resellers r WHERE r.user_id = u.id)
        """)
        bundle["validation"]["resellers_role_without_resellers_row"] = [r["email"] for r in cur.fetchall()]

        # Sample Logins
        sample_emails = [
            "deboraboscato@hotmail.com", "garcom@lancheriadai9.com",
            "ernanizatt1@icloud.com", "andreghiggi@gmail.com"
        ]
        sample_logins = []
        for email in sample_emails:
            cur.execute("""
                SELECT 
                  u.email,
                  (SELECT array_agg(DISTINCT ur.role) FROM public.user_roles ur WHERE ur.user_id = u.id) as roles,
                  (SELECT name FROM public.companies c JOIN public.company_users cu ON cu.company_id = c.id WHERE cu.user_id = u.id LIMIT 1) as company_name,
                  (SELECT name FROM public.resellers r WHERE r.user_id = u.id LIMIT 1) as reseller_name
                FROM auth.users u
                WHERE u.email = %s
            """, (email,))
            row = cur.fetchone()
            if row: sample_logins.append(row)
        bundle["validation"]["sample_logins"] = sample_logins

        print(json.dumps(bundle))
        cur.close()
        conn.close()

    except Exception as e:
        print(f"Error: {e}")
        exit(1)

if __name__ == "__main__":
    run()
