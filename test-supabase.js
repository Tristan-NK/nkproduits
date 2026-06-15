import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rhozijwbjjxtkbdxornv.supabase.co';
const supabaseKey = 'sb_publishable_5qMXuip2_Y689ry5Tj5r-Q_S-oRAvaj';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log("Testing connection...");
  const { data, error } = await supabase.from('lots').select('*').limit(1);
  if (error) {
    console.error("ERREUR DE CONNEXION:", error.message);
  } else {
    console.log("CONNEXION REUSSIE!", data);
  }
}

testConnection();
