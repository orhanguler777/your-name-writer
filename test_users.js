import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const { data: profiles, error } = await supabase.from('profiles').select('id, email, full_name, user_roles(role), departments(name)')
  if (error) console.error(error)
  else {
    console.log(JSON.stringify(profiles, null, 2))
  }
}
run()
