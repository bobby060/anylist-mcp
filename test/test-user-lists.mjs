import dotenv from 'dotenv';
dotenv.config();
import AnyList from '../anylist-js/lib/index.js';

const al = new AnyList({ email: process.env.ANYLIST_USERNAME, password: process.env.ANYLIST_PASSWORD });
await al.login();
await al.getLists();

const starter = al._userData.starterListsResponse;
const userLists = starter.userListsResponse;

console.log('userListsResponse keys:', Object.keys(userLists || {}).join(', '));
console.log('listResponses count:', userLists?.listResponses?.length);

for (const resp of userLists?.listResponses || []) {
  const list = resp.starterList;
  const items = list?.items || [];
  console.log(`\n  starterList listId=${list?.listId} name=${list?.name} type=${list?.starterListType} itemCount=${items.length}`);
  
  // Look for bread
  const breadItems = items.filter(i => i.name?.toLowerCase().includes('bread'));
  if (breadItems.length > 0) {
    console.log('  *** bread matches:');
    breadItems.forEach(i => console.log(`    name="${i.name}" categoryMatchId="${i.categoryMatchId}" category="${i.category}"`));
  }
  
  // Show first 3 items as sample
  items.slice(0, 3).forEach(i => console.log(`  sample: name="${i.name}" categoryMatchId="${i.categoryMatchId}"`));
}

await al.teardown();
