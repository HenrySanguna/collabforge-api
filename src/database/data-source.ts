import 'dotenv/config';
import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false, // SIEMPRE false, incluso en desarrollo (ver 05-data-model.md)
  logging:
    process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
});
