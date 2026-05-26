const { Client } = require('pg');

const databaseUrl = 'postgres://postgres:5e9d2a81ba0239be88be@salmon-partridge-969333.hostingersite.com:5432/flytzi_db?sslmode=disable';

async function migrate() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: false
  });

  try {
    await client.connect();
    console.log('Conectado a la base de datos con éxito.');
    
    console.log('Alterando la columna passport_country de la tabla reservations...');
    await client.query('ALTER TABLE reservations ALTER COLUMN passport_country TYPE VARCHAR(100);');
    console.log('¡Columna passport_country modificada con éxito a VARCHAR(100)!');
    
  } catch (error) {
    console.error('Error durante la migración:', error);
  } finally {
    await client.end();
  }
}

migrate();
