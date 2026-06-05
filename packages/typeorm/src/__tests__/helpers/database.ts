import { DataSource, type DataSourceOptions } from 'typeorm';
import { PGliteDriver } from 'typeorm-pglite';

export const createTestDataSource = async (
  entities: DataSourceOptions['entities'],
): Promise<DataSource> => {
  const dataSource = new DataSource({
    database: ':memory:',
    dropSchema: true,
    entities,
    logging: ['error', 'warn'],
    synchronize: true,
    type: 'postgres',
    driver: new PGliteDriver().driver,
  });

  await dataSource.initialize();
  await dataSource.synchronize();

  return dataSource;
};

export const destroyTestDataSource = async (dataSource: DataSource) => {
  await dataSource.dropDatabase();
  await dataSource.destroy();
};
