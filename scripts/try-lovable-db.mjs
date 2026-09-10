#!/usr/bin/env node
import postgres from 'postgres';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

const pwd = encodeURIComponent(process.env.LOVABLE_DB_PASSWORD || 'K7m2y9u4@123');
const ref = 'iwmrtxdzlkasuzutxvhh';
const urls = [
  `postgresql://postgres.${ref}:${pwd}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.${ref}:${pwd}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres.${ref}:${pwd}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres:${pwd}@db.${ref}.supabase.co:5432/postgres`,
];

for (const url of urls) {
  const host = url.match(/@([^/]+)/)?.[1] ?? url;
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });
  try {
    await sql`select 1 as ok`;
    const o = await sql`select count(*)::int as n from public.orders`;
    console.log('OK', host, 'orders=', o[0].n);
  } catch (e) {
    console.log('FAIL', host, e.message?.slice(0, 100));
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}
