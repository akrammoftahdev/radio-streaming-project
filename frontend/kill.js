const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://egonair_app:1875775a8312a87ae4cdb0b4f0099946fa16380017ab7e48@127.0.0.1:5432/egonair',
});

async function run() {
  await client.connect();
  const res = await client.query('UPDATE "LiveSession" SET status = \'ENDED\' WHERE status = \'LIVE\' RETURNING *');
  console.log(res.rows);
  await client.end();
}

run().catch(console.error);
