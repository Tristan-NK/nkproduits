import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rhozijwbjjxtkbdxornv.supabase.co';
const supabaseKey = 'sb_publishable_5qMXuip2_Y689ry5Tj5r-Q_S-oRAvaj';

export const supabase = createClient(supabaseUrl, supabaseKey);
