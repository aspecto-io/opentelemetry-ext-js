import { plugin } from '../src';
import { NoopLogger } from '@opentelemetry/core';
import { InMemorySpanExporter, SimpleSpanProcessor, ReadableSpan, Span } from '@opentelemetry/tracing';
import { NodeTracerProvider } from '@opentelemetry/node';
import { context, CanonicalCode } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { ContextManager } from '@opentelemetry/context-base';
import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';
import * as sequelize from 'sequelize';

describe('plugin-sequelize', () => {
    const logger = new NoopLogger();
    const provider = new NodeTracerProvider();
    const memoryExporter = new InMemorySpanExporter();
    const spanProcessor = new SimpleSpanProcessor(memoryExporter);

    provider.addSpanProcessor(spanProcessor);
    let contextManager: ContextManager;

    const getSequelizeSpans = (): ReadableSpan[] => {
        return memoryExporter.getFinishedSpans().filter((s) => s.attributes['component'] === 'sequelize');
    };

    beforeEach(() => {
        contextManager = new AsyncHooksContextManager();
        context.setGlobalContextManager(contextManager.enable());
        plugin.enable(sequelize, provider, logger);
    });

    afterEach(() => {
        memoryExporter.reset();
        contextManager.disable();
    });

    describe('postgres', () => {
        const DB_SYSTEM = 'postgres';
        const DB_USER = 'some-user';
        const NET_PEER_NAME = 'localhost';
        const NET_PEER_PORT = '12345';
        const DB_NAME = 'my-db';

        const instance = new sequelize.Sequelize(
            `${DB_SYSTEM}://${DB_USER}@${NET_PEER_NAME}:${NET_PEER_PORT}/${DB_NAME}`,
            { logging: false }
        );
        const User = instance.define('User', {
            firstName: {
                type: sequelize.DataTypes.STRING,
                allowNull: false,
            },
        });

        it('create is instrumented', async () => {
            try {
                await instance.models.User.create({ firstName: 'Nir' });
            } catch {
                // Error is thrown but we don't care
            }
            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            expect(spans[0].status.code).toBe(CanonicalCode.UNKNOWN);
            const attributes = spans[0].attributes;

            expect(attributes['component']).toBe('sequelize');
            expect(attributes[DatabaseAttribute.DB_SYSTEM]).toBe(DB_SYSTEM);
            expect(attributes[DatabaseAttribute.DB_USER]).toBe(DB_USER);
            expect(attributes[GeneralAttribute.NET_PEER_NAME]).toBe(NET_PEER_NAME);
            expect(attributes[GeneralAttribute.NET_PEER_PORT]).toBe(NET_PEER_PORT);
            expect(attributes[DatabaseAttribute.DB_NAME]).toBe(DB_NAME);
            expect(attributes[DatabaseAttribute.DB_OPERATION]).toBe('INSERT');
            expect(attributes[DatabaseAttribute.DB_STATEMENT]).toBe(
                'INSERT INTO "Users" ("id","firstName","createdAt","updatedAt") VALUES (DEFAULT,$1,$2,$3) RETURNING *;'
            );
        });

        it('findAll is instrumented', async () => {
            try {
                await instance.models.User.findAll();
            } catch {
                // Error is thrown but we don't care
            }
            const spans = getSequelizeSpans();
            const attributes = spans[0].attributes;

            expect(attributes['component']).toBe('sequelize');
            expect(attributes[DatabaseAttribute.DB_OPERATION]).toBe('SELECT');
            expect(attributes[DatabaseAttribute.DB_STATEMENT]).toBe(
                'SELECT "id", "firstName", "createdAt", "updatedAt" FROM "Users" AS "User";'
            );
        });

        it('destroy is instrumented', async () => {
            try {
                await instance.models.User.destroy({ where: {}, truncate: true });
            } catch {
                // Error is thrown but we don't care
            }
            const spans = getSequelizeSpans();
            const attributes = spans[0].attributes;

            expect(attributes['component']).toBe('sequelize');
            expect(attributes[DatabaseAttribute.DB_OPERATION]).toBe('BULKDELETE');
            expect(attributes[DatabaseAttribute.DB_STATEMENT]).toBe('TRUNCATE "Users"');
        });

        it('count is instrumented', async () => {
            try {
                await (User as any).count();
            } catch {
                // Error is thrown but we don't care
            }
            const spans = getSequelizeSpans();
            const attributes = spans[0].attributes;

            expect(attributes['component']).toBe('sequelize');
            expect(attributes[DatabaseAttribute.DB_OPERATION]).toBe('SELECT');
            expect(attributes[DatabaseAttribute.DB_STATEMENT]).toBe(
                'SELECT count(*) AS "count" FROM "Users" AS "User";'
            );
        });
    });

    describe('mysql', () => {
        const DB_SYSTEM = 'mysql';
        const DB_USER = 'RickSanchez';
        const NET_PEER_NAME = 'localhost';
        const NET_PEER_PORT = 34567;
        const DB_NAME = 'mysql-db';

        const instance = new sequelize.Sequelize(DB_NAME, DB_USER, 'password', {
            host: NET_PEER_NAME,
            port: NET_PEER_PORT,
            dialect: DB_SYSTEM,
        });

        instance.define('User', {
            firstName: {
                type: sequelize.DataTypes.STRING,
                allowNull: false,
            },
        });

        it('create is instrumented', async () => {
            try {
                await instance.models.User.create({ firstName: 'Nir' });
            } catch {
                // Error is thrown but we don't care
            }
            const spans = getSequelizeSpans();
            expect(spans[0].status.code).toBe(CanonicalCode.UNKNOWN);
            const attributes = spans[0].attributes;

            expect(attributes['component']).toBe('sequelize');
            expect(attributes[DatabaseAttribute.DB_SYSTEM]).toBe(DB_SYSTEM);
            expect(attributes[DatabaseAttribute.DB_USER]).toBe(DB_USER);
            expect(attributes[GeneralAttribute.NET_PEER_NAME]).toBe(NET_PEER_NAME);
            expect(attributes[GeneralAttribute.NET_PEER_PORT]).toBe(String(NET_PEER_PORT));
            expect(attributes[DatabaseAttribute.DB_NAME]).toBe(DB_NAME);
            expect(attributes[DatabaseAttribute.DB_OPERATION]).toBe('INSERT');
            expect(attributes[DatabaseAttribute.DB_STATEMENT]).toBe(
                'INSERT INTO `Users` (`id`,`firstName`,`createdAt`,`updatedAt`) VALUES (DEFAULT,$1,$2,$3);'
            );
        });

        it('findAll is instrumented', async () => {
            try {
                await instance.models.User.findAll();
            } catch {
                // Error is thrown but we don't care
            }
            const spans = getSequelizeSpans();
            const attributes = spans[0].attributes;

            expect(attributes['component']).toBe('sequelize');
            expect(attributes[DatabaseAttribute.DB_OPERATION]).toBe('SELECT');
            expect(attributes[DatabaseAttribute.DB_STATEMENT]).toBe(
                'SELECT `id`, `firstName`, `createdAt`, `updatedAt` FROM `Users` AS `User`;'
            );
        });
    });
});
