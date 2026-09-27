import { supabase } from './db/supabase';

async function testConnection() {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .limit(1);

  if (error) {
    console.error('❌ Connection failed:', error.message);
    return;
  }

  console.log('✅ Connected to Supabase successfully');
  console.log('Sample data:', data);
}

testConnection();