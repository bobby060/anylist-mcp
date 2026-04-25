import dotenv from 'dotenv';
dotenv.config();
import AnyList from '../anylist-js/lib/index.js';

const al = new AnyList({ email: process.env.ANYLIST_USERNAME, password: process.env.ANYLIST_PASSWORD });
await al.login();
await al.getLists();

// Show all keys in _userData
console.log('=== _userData top-level keys ===');
if (al._userData) {
  for (const [key, val] of Object.entries(al._userData)) {
    const str = JSON.stringify(val);
    console.log(`  ${key}: size=${str?.length || 0}`);
    // If it has bread info
    if (str && str.toLowerCase().includes('bread')) {
      console.log(`    *** Contains "bread" ***`);
    }
  }
}

await al.teardown();
