import dotenv from 'dotenv';
dotenv.config();
import AnyList from '../anylist-js/lib/index.js';

const al = new AnyList({ email: process.env.ANYLIST_USERNAME, password: process.env.ANYLIST_PASSWORD });
await al.login();
await al.getLists();

const ud = al._userData;

// 1. Embedded categorizedItemsResponse
const embedded = ud.categorizedItemsResponse;
console.log('=== categorizedItemsResponse (embedded in user-data/get) ===');
console.log('type:', typeof embedded, 'keys:', embedded ? Object.keys(embedded).join(', ') : 'null');
const embeddedItems = embedded?.categorizedItems || [];
console.log('count:', embeddedItems.length);
const breadEmbedded = embeddedItems.filter(i => i.name?.toLowerCase().includes('bread'));
console.log('bread matches:', breadEmbedded.map(i => `name="${i.name}" catId="${i.categoryMatchId}"`));

// 2. userCategoriesResponse
const userCats = ud.userCategoriesResponse;
console.log('\n=== userCategoriesResponse ===');
console.log('type:', typeof userCats, 'keys:', userCats ? Object.keys(userCats).join(', ') : 'null');
const cats = userCats?.categories || [];
console.log('categories count:', cats.length);
cats.slice(0, 5).forEach(c => console.log(`  name="${c.name}" systemCategory="${c.systemCategory}" categoryMatchId="${c.categoryMatchId}"`));

await al.teardown();
