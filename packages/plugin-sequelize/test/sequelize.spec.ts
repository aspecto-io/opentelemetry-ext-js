import 'mocha';
import { SequelizeInstrumentation } from '../src';
import { InMemorySpanExporter, SimpleSpanProcessor, ReadableSpan, Span } from '@opentelemetry/tracing';
import { NodeTracerProvider } from '@opentelemetry/node';
import { context, StatusCode, NoopLogger } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { ContextManager } from '@opentelemetry/context-base';
import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';
import expect from 'expect';

const logger = new NoopLogger();
const instrumentation = new SequelizeInstrumentation({ logger });
import * as sequelize from 'sequelize';

describe('instrumentation-sequelize', () => {
    const provider = new NodeTracerProvider({ logger });
    const memoryExporter = new InMemorySpanExporter();
    const spanProcessor = new SimpleSpanProcessor(memoryExporter);
    provider.addSpanProcessor(spanProcessor);
    instrumentation.setTracerProvider(provider);
    let contextManager: ContextManager;

    const getSequelizeSpans = (): ReadableSpan[] => {
        return memoryExporter.getFinishedSpans().filter((s) => s.attributes['component'] === 'sequelize');
    };

    beforeEach(() => {
        contextManager = new AsyncHooksContextManager();
        context.setGlobalContextManager(contextManager.enable());
        instrumentation.enable();
    });

    afterEach(() => {
        memoryExporter.reset();
        contextManager.disable();
        instrumentation.disable();
    });

    describe('postgres', () => {
        const DB_SYSTEM = 'postgres';
        const DB_USER = 'some-user';
        const NET_PEER_NAME = 'localhost';
        const NET_PEER_PORT = 12345;
        const DB_NAME = 'my-db';

        const instance = new sequelize.Sequelize(
            `${DB_SYSTEM}://${DB_USER}@${NET_PEER_NAME}:${NET_PEER_PORT}/${DB_NAME}`,
            { logging: false }
        );
        const User = instance.define('User', { firstName: { type: sequelize.DataTypes.STRING } });

        it('create is instrumented', async () => {
            try {
                await instance.models.User.create({ firstName: 'Nir' });
            } catch {
                // Error is thrown but we don't care
            }
            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            expect(spans[0].status.code).toBe(StatusCode.ERROR);
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
            await instance.models.User.findAll().catch(() => {});
            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            const attributes = spans[0].attributes;

            expect(attributes['component']).toBe('sequelize');
            expect(attributes[DatabaseAttribute.DB_OPERATION]).toBe('SELECT');
            expect(attributes[DatabaseAttribute.DB_STATEMENT]).toBe(
                'SELECT "id", "firstName", "createdAt", "updatedAt" FROM "Users" AS "User";'
            );
        });

        it('destroy is instrumented', async () => {
            await instance.models.User.destroy({ where: {}, truncate: true }).catch(() => {});
            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            const attributes = spans[0].attributes;

            expect(attributes['component']).toBe('sequelize');
            expect(attributes[DatabaseAttribute.DB_OPERATION]).toBe('BULKDELETE');
            expect(attributes[DatabaseAttribute.DB_STATEMENT]).toBe('TRUNCATE "Users"');
        });

        it('count is instrumented', async () => {
            await (User as any).count().catch(() => {});
            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            const attributes = spans[0].attributes;

            expect(attributes['component']).toBe('sequelize');
            expect(attributes[DatabaseAttribute.DB_OPERATION]).toBe('SELECT');
            expect(attributes[DatabaseAttribute.DB_STATEMENT]).toBe(
                'SELECT count(*) AS "count" FROM "Users" AS "User";'
            );
        });

        it('handled complex query', async () => {
            const Op = sequelize.Op;
            await instance.models.User.findOne({
                where: {
                    username: 'Shlomi',
                    rank: {
                        [Op.or]: {
                            [Op.lt]: 1000,
                            [Op.eq]: null,
                        },
                    },
                },
                attributes: ['id', 'username'],
                order: [['username', 'DESC']],
                limit: 10,
                offset: 5,
            }).catch(() => {});
            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            const attributes = spans[0].attributes;

            expect(attributes['component']).toBe('sequelize');
            expect(attributes[DatabaseAttribute.DB_OPERATION]).toBe('SELECT');
            expect(attributes[DatabaseAttribute.DB_STATEMENT]).toBe(
                `SELECT "id", "username" FROM "Users" AS "User" WHERE "User"."username" = 'Shlomi' AND ("User"."rank" < 1000 OR "User"."rank" IS NULL) ORDER BY "User"."username" DESC LIMIT 10 OFFSET 5;`
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

        instance.define('User', { firstName: { type: sequelize.DataTypes.STRING } });

        it('create is instrumented', async () => {
            await instance.models.User.create({ firstName: 'Nir' }).catch(() => {});
            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            expect(spans[0].status.code).toBe(StatusCode.ERROR);
            const attributes = spans[0].attributes;

            expect(attributes['component']).toBe('sequelize');
            expect(attributes[DatabaseAttribute.DB_SYSTEM]).toBe(DB_SYSTEM);
            expect(attributes[DatabaseAttribute.DB_USER]).toBe(DB_USER);
            expect(attributes[GeneralAttribute.NET_PEER_NAME]).toBe(NET_PEER_NAME);
            expect(attributes[GeneralAttribute.NET_PEER_PORT]).toBe(NET_PEER_PORT);
            expect(attributes[DatabaseAttribute.DB_NAME]).toBe(DB_NAME);
            expect(attributes[DatabaseAttribute.DB_OPERATION]).toBe('INSERT');
            expect(attributes[DatabaseAttribute.DB_STATEMENT]).toBe(
                'INSERT INTO `Users` (`id`,`firstName`,`createdAt`,`updatedAt`) VALUES (DEFAULT,$1,$2,$3);'
            );
        });

        it('findAll is instrumented', async () => {
            await instance.models.User.findAll().catch(() => {});
            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            const attributes = spans[0].attributes;

            expect(attributes['component']).toBe('sequelize');
            expect(attributes[DatabaseAttribute.DB_OPERATION]).toBe('SELECT');
            expect(attributes[DatabaseAttribute.DB_STATEMENT]).toBe(
                'SELECT `id`, `firstName`, `createdAt`, `updatedAt` FROM `Users` AS `User`;'
            );
        });
    });

    describe('responseHook', () => {
        it('able to collect response', async () => {
            instrumentation.disable();
            const instance = new sequelize.Sequelize(`postgres://john@$localhost:1111/my-name`, { logging: false });
            instance.define('User', { firstName: { type: sequelize.DataTypes.STRING } });

            const response = { john: 'doe' };
            sequelize.Sequelize.prototype.query = () => {
                return new Promise((resolve) => resolve(response));
            };
            instrumentation.setConfig({
                responseHook: (span: Span, response: any) => {
                    span.setAttribute('test', JSON.stringify(response));
                },
            });
            instrumentation.enable();

            await instance.models.User.findAll();
            const spans = getSequelizeSpans();
            const attributes = spans[0].attributes;

            expect(attributes['test']).toBe(JSON.stringify(response));
            expect(attributes['component']).toBe('sequelize');
        });

        it('response hook which throws does not affect span', async () => {
            instrumentation.disable();
            const instance = new sequelize.Sequelize(`postgres://john@$localhost:1111/my-name`, { logging: false });
            instance.define('User', { firstName: { type: sequelize.DataTypes.STRING } });

            const response = { john: 'doe' };
            sequelize.Sequelize.prototype.query = () => {
                return new Promise((resolve) => resolve(response));
            };
            const mockedLogger = (() => {
                let message: string;
                let error: Error;
                return {
                    error: (_message: string, _err: Error) => {
                        message = _message;
                        error = _err;
                    },
                    debug: () => {},
                    getMessage: () => message,
                    getError: () => error,
                };
            })();

            instrumentation.setConfig({
                logger: mockedLogger as any,
                responseHook: () => {
                    throw new Error('Throwing');
                },
            });
            instrumentation.enable();
            await instance.models.User.findAll();
            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            expect(mockedLogger.getMessage()).toBe('Caught Error while applying responseHook');
            expect(mockedLogger.getError().message).toBe('Throwing');
        });
    });

    describe('ignoreOrphanedSpans', () => {
        it('skips when ignoreOrphanedSpans option is true', async () => {
            instrumentation.disable();
            const instance = new sequelize.Sequelize(`postgres://john@$localhost:1111/my-name`, { logging: false });
            instance.define('User', { firstName: { type: sequelize.DataTypes.STRING } });
            instrumentation.setConfig({
                ignoreOrphanedSpans: true,
            });
            instrumentation.enable();

            try {
                await instance.models.User.create({ firstName: 'Nir' });
            } catch {}

            const spans = getSequelizeSpans();
            expect(spans.length).toBe(0);
        });
    });
});
