import { join } from 'path';

import { DataSource, type DataSourceOptions } from 'typeorm';

type PostgresSsl = Extract<DataSourceOptions, { type: 'postgres' }>['ssl'];

import 'dotenv/config';
import { buildSslOptions } from './config/db-ssl';
import { dbSslMode, migrationsRunOnBoot } from './config/env';

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

// TLS follows libpq's sslmode vocabulary (DB_SSL_MODE). Non-local hosts default
// to verify-full; RDS hosts verify against the bundled AWS CA unless
// DB_SSL_CA_FILE points elsewhere. See config/db-ssl.ts.
const SSL = buildSslOptions(
  dbSslMode(process.env, DB_HOST),
  process.env.DB_SSL_CA_FILE,
  DB_HOST,
);

const AppDataSource = new DataSource({
  type: 'postgres',
  host: DB_HOST,
  port: DB_PORT,
  username: DB_USERNAME,
  password: DB_PASSWORD,
  database: DB_DATABASE,
  // pg forwards these to tls.connect(); its declared type omits checkServerIdentity.
  ssl: SSL as PostgresSsl,
  synchronize: false,
  entities: [join(__dirname, '**', '*.entity.{ts,js}')],
  subscribers: [join(__dirname, '**', '*.subscriber.{ts,js}')],
  migrations: [join(__dirname, 'database', 'migrations', '*.{ts,js}')],
  // Development runs migrations on boot. Production runs `activate migrate` as a
  // step before pods roll (MIGRATIONS_RUN_ON_BOOT=true restores the old behaviour).
  migrationsRun: migrationsRunOnBoot(),
  migrationsTransactionMode: 'each',
  logging: false,
});

export default AppDataSource;
