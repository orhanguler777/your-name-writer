import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://xxx.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'xxx';

// Let's read from whatsapp-bot env or index.js
import fs from 'fs';
const envContent = fs.readFileSync('./whatsapp-bot/.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY || env.SUPABASE_ANON_KEY);

async function main() {
  const { data: complaints, error: cErr } = await client
    .from('complaints')
    .select('id, citizen_name, citizen_phone, status, source, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
    
  console.log('Latest 10 complaints:');
  console.log(JSON.stringify(complaints, null, 2));

  const { data: responses, error: rErr } = await client
    .from('complaint_responses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\nLatest 10 responses:');
  console.log(JSON.stringify(responses, null, 2));
}

main().catch(console.error);
