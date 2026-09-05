import { join } from 'path';

import { DataSource } from 'typeorm';

import 'dotenv/config';

interface DbSecret {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  dbname?: string;
}

// In AWS the ECS task receives the whole Secrets Manager DB secret as a JSON
// blob in the `DB` env var ({host, port, username, password, dbname}).
// Locally the flat DB_* vars from .env are used instead.
const DB: DbSecret = process.env.DB
  ? (JSON.parse(process.env.DB) as DbSecret)
  : {};

const DB_HOST = DB.host ?? process.env.DB_HOST ?? 'localhost';
const DB_PORT = Number(DB.port ?? process.env.DB_PORT ?? 5432);
const DB_USERNAME = DB.username ?? process.env.DB_USERNAME ?? 'postgres';
const DB_PASSWORD = DB.password ?? process.env.DB_PASSWORD ?? 'postgres';
const DB_DATABASE = DB.dbname ?? process.env.DB_DATABASE ?? 'lightci_activate';

// The RDS cluster enforces rds.force_ssl, so any non-local connection must
// use TLS. Local docker Postgres has no server certificate, so keep local
// connections plain. RDS terminates TLS with an Amazon-internal CA; we rely
// on transport encryption (the force_ssl goal) rather than CA verification.
const isLocalDb = DB_HOST === 'localhost' || DB_HOST === '127.0.0.1';
const DB_SSL = process.env.DB_SSL ? process.env.DB_SSL === 'true' : !isLocalDb;

const AppDataSource = new DataSource({
  type: 'postgres',
  host: DB_HOST,
  port: DB_PORT,
  username: DB_USERNAME,
  password: DB_PASSWORD,
  database: DB_DATABASE,
  ssl: DB_SSL ? { rejectUnauthorized: false } : false,
  synchronize: false,
  entities: [join(__dirname, '**', '*.entity.{ts,js}')],
  subscribers: [join(__dirname, '**', '*.subscriber.{ts,js}')],
  migrations: [join(__dirname, 'database', 'migrations', '*.{ts,js}')],
  migrationsRun: true,
  migrationsTransactionMode: 'each',
  logging: false,
});

export default AppDataSource;
