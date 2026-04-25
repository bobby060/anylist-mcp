import dotenv from 'dotenv';
dotenv.config();
import AnyList from '../anylist-js/lib/index.js';
import FormData from 'form-data';

const al = new AnyList({ email: process.env.ANYLIST_USERNAME, password: process.env.ANYLIST_PASSWORD });
await al.login();
await al.getLists();

// Try product lookup endpoints with various methods and params
const queries = ['Bread', 'bread', 'Strawberry', 'Milk'];

for (const q of queries.slice(0, 1)) {
  // Try GET with query param
  for (const ep of ['data/item-lookup', 'data/items/search', 'data/product-lookup', 'data/item-suggestion']) {
    try {
      const result = await al.client.get(`${ep}?name=${encodeURIComponent(q)}&listId=${al.lists[0].identifier}`);
      console.log(`GET ${ep}?name=${q}: status OK, length=${result.body?.length}`);
      if (Buffer.isBuffer(result.body) && result.body.length > 0) {
        try {
          const decoded = al.protobuf.PBProductLookupResponse.decode(result.body);
          console.log('  Decoded:', JSON.stringify(decoded));
        } catch {}
      }
    } catch (err) {
      const status = err.response?.statusCode || err.message.slice(0, 50);
      console.log(`GET ${ep}?name=${q}: ${status}`);
    }
  }
  
  // Try POST with form data
  for (const ep of ['data/item-lookup', 'data/items/search', 'data/product-lookup']) {
    try {
      const form = new FormData();
      form.append('name', q);
      form.append('listId', al.lists[0].identifier);
      const result = await al.client.post(ep, { body: form });
      console.log(`POST ${ep} name=${q}: status OK, length=${result.body?.length}`);
      if (Buffer.isBuffer(result.body) && result.body.length > 0) {
        try {
          const decoded = al.protobuf.PBProductLookupResponse.decode(result.body);
          console.log('  Decoded:', JSON.stringify(decoded));
        } catch (e) {
          console.log('  Body hex:', result.body.toString('hex').slice(0, 100));
        }
      }
    } catch (err) {
      const status = err.response?.statusCode || err.message.slice(0, 50);
      console.log(`POST ${ep} name=${q}: ${status}`);
    }
  }
}

await al.teardown();
