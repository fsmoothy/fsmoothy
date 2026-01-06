import { defineEvents, defineStates } from '@fsmoothy/core';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { PGliteDriver } from 'typeorm-pglite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { StateMachineEntity, state, t } from '../..';

/**
 * First, user submits a file to the server.
 * We're uploading a file to S3 bucket and want to track its state.
 */

const FileState = defineStates('pending', 'uploading', 'completed', 'failed');
type FileState = typeof FileState.type;

const FileEvent = defineEvents('start', 'finish', 'fail');
type FileEvent = typeof FileEvent.type;

interface IFile {
  id: string;
  status: FileState;
  url: string | null;
}

@Entity('file')
class File
  extends StateMachineEntity({
    status: state<FileState, FileEvent>({
      id: 'fileStatus',
      initial: FileState.pending,
      transitions: [
        t(FileState.pending, FileEvent.start, FileState.uploading),
        t(FileState.uploading, FileEvent.finish, FileState.completed, {
          async guard(this: IFile, _context, url: string) {
            return this.url !== url;
          },
          async onEnter(this: File, _context, url: string | null) {
            this.url = url;
          },
        }),
        t(
          [FileState.pending, FileState.uploading],
          FileEvent.fail,
          FileState.failed,
        ),
      ],
    }),
  })
  implements IFile
{
  @PrimaryGeneratedColumn()
  id: string;

  @Column({ nullable: true, type: 'varchar' })
  url: string | null;
}

describe('File upload', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      name: (Date.now() * Math.random()).toString(16),
      database: ':memory:',
      dropSchema: true,
      entities: [File],
      logging: ['error', 'warn'],
      synchronize: true,
      type: 'postgres',
      driver: new PGliteDriver().driver,
    });

    await dataSource.initialize();
    await dataSource.synchronize();
  });

  afterAll(async () => {
    await dataSource.dropDatabase();
    await dataSource.destroy();
  });

  afterEach(async () => {
    await dataSource.manager.clear(File);
  });

  const findFileById = async (id: string) => {
    return await dataSource.manager.findOneOrFail(File, {
      where: {
        id,
      },
    });
  };

  it('should change state', async () => {
    const file = new File();
    await file.save();

    expect(file.fsm.status.isPending()).toBe(true);

    await file.fsm.status.start();
    expect(file.fsm.status.isUploading()).toBe(true);

    const savedFile = await findFileById(file.id);

    expect(savedFile).toEqual(
      expect.objectContaining({ status: FileState.uploading }),
    );

    await file.fsm.status.finish('https://example.com');
    expect(file.fsm.status.isCompleted()).toBe(true);
    expect(await findFileById(file.id)).toEqual(
      expect.objectContaining({
        status: FileState.completed,
        url: 'https://example.com',
      }),
    );
  });

  it('should bulk update to different state', async () => {
    const file1 = await dataSource.manager
      .create(File, {
        status: FileState.pending,
      })
      .save();
    const file2 = await dataSource.manager
      .create(File, {
        status: FileState.uploading,
      })
      .save();

    const filesToUpdate = [
      {
        file: file1,
        event: FileEvent.start,
      },
      {
        file: file2,
        event: FileEvent.fail,
      },
    ];

    await Promise.all(
      filesToUpdate.map(({ file, event }) => file.fsm.status.transition(event)),
    );

    expect(file1.fsm.status.isUploading()).toBe(true);
    expect(file2.fsm.status.isFailed()).toBe(true);
  });
});
