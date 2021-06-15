import 'mocha';
import expect from 'expect';
import { SequelizeInstrumentation } from '../src';
import { extractTableFromQuery } from '../src/utils';
import { ReadableSpan, Span } from '@opentelemetry/tracing';
import { context, diag, SpanStatusCode, DiagConsoleLogger, ROOT_CONTEXT } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { getTestSpans } from 'opentelemetry-instrumentation-testing-utils';

// should be available in node_modules from sequelize installation
const Promise = require('bluebird');

const instrumentation = new SequelizeInstrumentation();
import * as sequelize from 'sequelize';

describe('instrumentation-sequelize', () => {
    const getSequelizeSpans = (): ReadableSpan[] => {
        return getTestSpans().filter((s) => s.instrumentationLibrary.name.includes('sequelize'));
    };

    beforeEach(() => {
        instrumentation.enable();
    });

    afterEach(() => {
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
            expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
            const attributes = spans[0].attributes;

            expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(DB_SYSTEM);
            expect(attributes[SemanticAttributes.DB_USER]).toBe(DB_USER);
            expect(attributes[SemanticAttributes.NET_PEER_NAME]).toBe(NET_PEER_NAME);
            expect(attributes[SemanticAttributes.NET_PEER_PORT]).toBe(NET_PEER_PORT);
            expect(attributes[SemanticAttributes.DB_NAME]).toBe(DB_NAME);
            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('INSERT');
            expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('Users');
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(
                'INSERT INTO "Users" ("id","firstName","createdAt","updatedAt") VALUES (DEFAULT,$1,$2,$3) RETURNING *;'
            );
        });

        it('findAll is instrumented', async () => {
            await instance.models.User.findAll().catch(() => {});
            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            const attributes = spans[0].attributes;

            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('SELECT');
            expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('Users');
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(
                'SELECT "id", "firstName", "createdAt", "updatedAt" FROM "Users" AS "User";'
            );
        });

        it('destroy is instrumented', async () => {
            await instance.models.User.destroy({ where: {}, truncate: true }).catch(() => {});
            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            const attributes = spans[0].attributes;

            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('BULKDELETE');
            expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('Users');
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe('TRUNCATE "Users"');
        });

        it('count is instrumented', async () => {
            await (User as any).count().catch(() => {});
            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            const attributes = spans[0].attributes;

            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('SELECT');
            expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('Users');
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(
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

            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('SELECT');
            expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('Users');
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(
                `SELECT "id", "username" FROM "Users" AS "User" WHERE "User"."username" = 'Shlomi' AND ("User"."rank" < 1000 OR "User"."rank" IS NULL) ORDER BY "User"."username" DESC LIMIT 10 OFFSET 5;`
            );
        });

        it('handles JOIN queries', async () => {
            instance.define('Dog', {
                firstName: { type: sequelize.DataTypes.STRING },
                owner: { type: sequelize.DataTypes.STRING },
            });
            instance.models.User.hasMany(instance.models.Dog, { foreignKey: 'firstName' });
            instance.models.Dog.belongsTo(instance.models.User, { foreignKey: 'firstName' });

            await instance.models.Dog.findOne({
                attributes: ['firstName', 'owner'],
                include: [
                    {
                        model: User,
                        attributes: ['firstName'],
                        required: true,
                    },
                ],
            }).catch(() => {});

            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            const attributes = spans[0].attributes;

            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('SELECT');
            expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('Dogs,Users');
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(
                `SELECT "Dog"."id", "Dog"."firstName", "Dog"."owner", "User"."id" AS "User.id", "User"."firstName" AS "User.firstName" FROM "Dogs" AS "Dog" INNER JOIN "Users" AS "User" ON "Dog"."firstName" = "User"."id" LIMIT 1;`
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
            expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
            const attributes = spans[0].attributes;

            expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(DB_SYSTEM);
            expect(attributes[SemanticAttributes.DB_USER]).toBe(DB_USER);
            expect(attributes[SemanticAttributes.NET_PEER_NAME]).toBe(NET_PEER_NAME);
            expect(attributes[SemanticAttributes.NET_PEER_PORT]).toBe(NET_PEER_PORT);
            expect(attributes[SemanticAttributes.DB_NAME]).toBe(DB_NAME);
            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('INSERT');
            expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('Users');
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(
                'INSERT INTO `Users` (`id`,`firstName`,`createdAt`,`updatedAt`) VALUES (DEFAULT,$1,$2,$3);'
            );
        });

        it('findAll is instrumented', async () => {
            await instance.models.User.findAll().catch(() => {});
            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            const attributes = spans[0].attributes;

            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('SELECT');
            expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('Users');
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(
                'SELECT `id`, `firstName`, `createdAt`, `updatedAt` FROM `Users` AS `User`;'
            );
        });
    });

    describe('sqlite', () => {
        const instance = new sequelize.Sequelize('sqlite:memory', {
            logging: false,
        });
        instance.define('User', { firstName: { type: sequelize.DataTypes.STRING } });

        it('create is instrumented', async () => {
            await instance.models.User.create({ firstName: 'Nir' }).catch(() => {});
            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            const attributes = spans[0].attributes;
            expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe('sqlite');
            expect(attributes[SemanticAttributes.NET_PEER_NAME]).toBe('memory');
            expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('INSERT');
            expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('Users');
            expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(
                'INSERT INTO `Users` (`id`,`firstName`,`createdAt`,`updatedAt`) VALUES (NULL,$1,$2,$3);'
            );
        });
    });

    describe('config', () => {
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
                    responseHook: () => {
                        throw new Error('Throwing');
                    },
                });
                instrumentation.enable();
                diag.setLogger(mockedLogger as any);
                await instance.models.User.findAll();
                const spans = getSequelizeSpans();
                expect(spans.length).toBe(1);
                expect(mockedLogger.getMessage()).toBe('sequelize instrumentation: responseHook error');
                expect(mockedLogger.getError().message).toBe('Throwing');
                diag.setLogger(new DiagConsoleLogger());
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
                    await context.with(ROOT_CONTEXT, async () => {
                        await instance.models.User.create({ firstName: 'Nir' });
                    });
                } catch {}

                const spans = getSequelizeSpans();
                expect(spans.length).toBe(0);
            });
        });

        it('moduleVersionAttributeName', async () => {
            instrumentation.disable();
            const instance = new sequelize.Sequelize(`postgres://john@$localhost:1111/my-name`, { logging: false });
            instance.define('User', { firstName: { type: sequelize.DataTypes.STRING } });
            instrumentation.setConfig({
                moduleVersionAttributeName: 'module.version',
            });
            instrumentation.enable();
            try {
                await instance.models.User.create({ firstName: 'Nir' });
            } catch {
                // Error is thrown but we don't care
            }
            const spans = getSequelizeSpans();
            expect(spans.length).toBe(1);
            expect(spans[0].attributes['module.version']).toMatch(/\d{1,4}\.\d{1,4}\.\d{1,5}.*/);
        });
    });

    describe('misc', () => {
        it('extractTableFromQuery', async () => {
            expect(extractTableFromQuery('FROM Users JOIN Dogs Where 1243')).toBe('Dogs,Users');
            expect(extractTableFromQuery('FROM "Users"')).toBe('Users');
            expect(extractTableFromQuery('SELECT count(*) AS "count" FROM "Users" AS "User";')).toBe('Users');
            expect(
                extractTableFromQuery('SELECT `id`, `firstName`, `createdAt`, `updatedAt` FROM `Users` AS `User`;')
            ).toBe('Users');
            expect(extractTableFromQuery(null)).toBe(undefined);
            expect(extractTableFromQuery(undefined)).toBe(undefined);
        });
    });
});
