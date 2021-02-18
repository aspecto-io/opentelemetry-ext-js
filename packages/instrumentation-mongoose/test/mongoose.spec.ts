import 'mocha';
import expect from 'expect';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { NodeTracerProvider } from '@opentelemetry/node';
import { context, NoopLogger } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { DatabaseAttribute } from '@opentelemetry/semantic-conventions';
import { MongooseInstrumentation } from '../src';

const logger = new NoopLogger();
const instrumentation = new MongooseInstrumentation({
    logger,
    dbStatementSerializer: (_operation: string, payload) => JSON.stringify(payload),
});

import mongoose from 'mongoose';
import User, { IUser, loadUsers } from './user';
import { assertSpan, getStatement } from './asserts';

// Please run mongodb in the background: docker run -d -p 27017:27017 -v ~/data:/data/db mongo
describe('mongoose instrumentation', () => {
    const provider = new NodeTracerProvider();
    const memoryExporter = new InMemorySpanExporter();
    const spanProcessor = new SimpleSpanProcessor(memoryExporter);
    provider.addSpanProcessor(spanProcessor);
    instrumentation.setTracerProvider(provider);

    const getSpans = () => memoryExporter.getFinishedSpans();

    before(async () => {
        await mongoose.connect('mongodb://localhost:27017', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            useFindAndModify: false,
            useCreateIndex: true,
        });
    });

    after(async () => {
        await mongoose.connection.close();
    });

    beforeEach(async () => {
        context.setGlobalContextManager(new AsyncHooksContextManager().enable());
        instrumentation.enable();
        await loadUsers();
        await User.createIndexes();
    });

    afterEach(async () => {
        memoryExporter.reset();
        context.disable();
        instrumentation.disable();
        await User.collection.drop().catch();
    });

    it('instrumenting save operation with promise', async () => {
        const document = {
            firstName: 'Test first name',
            lastName: 'Test last name',
            email: 'test@example.com',
        };
        const user: IUser = new User(document);

        await user.save();

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('save');
        const statement = getStatement(spans[0]);
        expect(statement.document).toEqual(expect.objectContaining(document));
    });

    it('instrumenting save operation with callback', (done) => {
        const document = {
            firstName: 'Test first name',
            lastName: 'Test last name',
            email: 'test@example.com',
        };
        const user: IUser = new User(document);

        user.save(function () {
            const spans = getSpans();

            expect(spans.length).toBe(1);
            assertSpan(spans[0]);
            expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('save');
            const statement = getStatement(spans[0]);
            expect(statement.document).toEqual(expect.objectContaining(document));
            done();
        });
    });

    it('instrumenting find operation', async () => {
        await User.find({ id: '_test' });

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('find');
        const statement = getStatement(spans[0]);
        expect(statement.condition).toEqual({ id: '_test' });
    });

    it('instrumenting multiple find operations', async () => {
        await Promise.all([User.find({ id: '_test1' }), User.find({ id: '_test2' })]);

        const spans = getSpans();
        expect(spans.length).toBe(2);
        assertSpan(spans[0]);
        assertSpan(spans[1]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('find');
        expect(spans[0].attributes[DatabaseAttribute.DB_STATEMENT]).toMatch(/.*{"id":"_test[1-2]"}.*/g);
        expect(spans[1].attributes[DatabaseAttribute.DB_OPERATION]).toBe('find');
        expect(spans[1].attributes[DatabaseAttribute.DB_STATEMENT]).toMatch(/.*{"id":"_test[1-2]"}.*/g);
    });

    it('instrumenting find operation with chaining structures', async () => {
        await User.find({ id: '_test' }).skip(1).limit(2).sort({ email: 'asc' });

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('find');
        const statement = getStatement(spans[0]);
        expect(statement.condition).toEqual({ id: '_test' });
        expect(statement.options).toEqual({ skip: 1, limit: 2, sort: { email: 1 } });
    });

    it('instrumenting remove operation [deprecated]', async () => {
        const user = await User.findOne({ email: 'john.doe@example.com' });
        await user!.remove();

        const spans = getSpans();
        expect(spans.length).toBe(2);
        assertSpan(spans[1]);
        expect(spans[1].attributes[DatabaseAttribute.DB_OPERATION]).toBe('remove');
    });

    it('instrumenting remove operation with callbacks [deprecated]', (done) => {
        User.findOne({ email: 'john.doe@example.com' }).then((user) =>
            user!.remove({ overwrite: true }, () => {
                const spans = getSpans();
                expect(spans.length).toBe(2);
                assertSpan(spans[1]);
                expect(spans[1].attributes[DatabaseAttribute.DB_OPERATION]).toBe('remove');
                expect(getStatement(spans[1]).options).toEqual({ overwrite: true });
                done();
            })
        );
    });

    it('instrumenting deleteOne operation', async () => {
        await User.deleteOne({ email: 'john.doe@example.com' });

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('deleteOne');
    });

    it('instrumenting updateOne operation on models', async () => {
        const user = await User.findOne({ email: 'john.doe@example.com' });
        await user!.updateOne({ $inc: { age: 1 } }, { skip: 0 });

        const spans = getSpans();
        expect(spans.length).toBe(2);
        assertSpan(spans[1]);
        expect(spans[1].attributes[DatabaseAttribute.DB_OPERATION]).toBe('updateOne');

        const statement = getStatement(spans[1]);
        expect(statement.options).toEqual({ skip: 0 });
        expect(statement.updates).toEqual({ $inc: { age: 1 } });
        expect(statement.condition._id).toBeDefined();
    });

    it('instrumenting updateOne operation', async () => {
        await User.updateOne({ email: 'john.doe@example.com' }, { $inc: { age: 1 } }, { skip: 0 });

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('updateOne');

        const statement = getStatement(spans[0]);
        expect(statement.options).toEqual({ skip: 0 });
        expect(statement.updates).toEqual({ $inc: { age: 1 } });
        expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
    });

    it('instrumenting count operation [deprecated]', async () => {
        await User.count({});

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('count');
        const statement = getStatement(spans[0]);
        expect(statement.options).toEqual({});
        expect(statement.condition).toEqual({});
    });

    it('instrumenting countDocuments operation', async () => {
        await User.countDocuments({ email: 'john.doe@example.com' });

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('countDocuments');
        const statement = getStatement(spans[0]);
        expect(statement.options).toEqual({});
        expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
    });

    it('instrumenting estimatedDocumentCount operation', async () => {
        await User.estimatedDocumentCount();

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('estimatedDocumentCount');
        const statement = getStatement(spans[0]);
        expect(statement.options).toEqual({});
        expect(statement.condition).toEqual({});
    });

    it('instrumenting deleteMany operation', async () => {
        await User.deleteMany();

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('deleteMany');
        const statement = getStatement(spans[0]);
        expect(statement.options).toEqual({});
        expect(statement.condition).toEqual({});
    });

    it('instrumenting findOne operation', async () => {
        await User.findOne({ email: 'john.doe@example.com' });

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('findOne');
        const statement = getStatement(spans[0]);
        expect(statement.options).toEqual({});
        expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
    });

    it('instrumenting update operation [deprecated]', async () => {
        await User.update({ email: 'john.doe@example.com' }, { email: 'john.doe2@example.com' });

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('update');
        const statement = getStatement(spans[0]);
        expect(statement.options).toEqual({});
        expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
        expect(statement.updates).toEqual({ email: 'john.doe2@example.com' });
    });

    it('instrumenting updateOne operation', async () => {
        await User.updateOne({ email: 'john.doe@example.com' }, { age: 55 });

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('updateOne');
        const statement = getStatement(spans[0]);
        expect(statement.options).toEqual({});
        expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
        expect(statement.updates).toEqual({ age: 55 });
    });

    it('instrumenting updateMany operation', async () => {
        await User.updateMany({ age: 18 }, { isDeleted: true });

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('updateMany');
        const statement = getStatement(spans[0]);
        expect(statement.options).toEqual({});
        expect(statement.condition).toEqual({ age: 18 });
        expect(statement.updates).toEqual({ isDeleted: true });
    });

    it('instrumenting findOneAndDelete operation', async () => {
        await User.findOneAndDelete({ email: 'john.doe@example.com' });

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('findOneAndDelete');
        const statement = getStatement(spans[0]);
        expect(statement.options).toEqual({});
        expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
    });

    it('instrumenting findOneAndUpdate operation', async () => {
        await User.findOneAndUpdate({ email: 'john.doe@example.com' }, { isUpdated: true });

        const spans = getSpans();
        expect(spans.length).toBe(2);
        assertSpan(spans[0]);
        assertSpan(spans[1]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('findOne');
        expect(spans[1].attributes[DatabaseAttribute.DB_OPERATION]).toBe('findOneAndUpdate');
        const statement = getStatement(spans[1]);
        expect(statement.options).toEqual({});
        expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
        expect(statement.updates).toEqual({ isUpdated: true });
    });

    it('instrumenting findOneAndRemove operation', async () => {
        await User.findOneAndRemove({ email: 'john.doe@example.com' });

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('findOneAndRemove');
        const statement = getStatement(spans[0]);
        expect(statement.options).toEqual({});
        expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
    });

    it('instrumenting create operation', async () => {
        const document = { firstName: 'John', lastName: 'Doe', email: 'john.doe+1@example.com' };
        await User.create(document);

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('save');
        const statement = getStatement(spans[0]);
        expect(statement.options).toEqual({});
        expect(statement.document).toEqual(expect.objectContaining(document));
    });

    it('instrumenting aggregate operation', async () => {
        await User.aggregate([
            { $match: { firstName: 'John' } },
            { $group: { _id: 'John', total: { $sum: '$amount' } } },
        ]);

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('aggregate');
        const statement = getStatement(spans[0]);
        expect(statement.aggregatePipeline).toEqual([
            { $match: { firstName: 'John' } },
            { $group: { _id: 'John', total: { $sum: '$amount' } } },
        ]);
    });

    it('instrumenting aggregate operation with callback', (done) => {
        User.aggregate(
            [{ $match: { firstName: 'John' } }, { $group: { _id: 'John', total: { $sum: '$amount' } } }],
            () => {
                const spans = getSpans();
                expect(spans.length).toBe(1);
                assertSpan(spans[0]);
                expect(spans[0].attributes[DatabaseAttribute.DB_OPERATION]).toBe('aggregate');
                const statement = getStatement(spans[0]);
                expect(statement.aggregatePipeline).toEqual([
                    { $match: { firstName: 'John' } },
                    { $group: { _id: 'John', total: { $sum: '$amount' } } },
                ]);
                done();
            }
        );
    });

    it('instrumenting combined operation with async/await', async () => {
        await User.find({ id: '_test' }).skip(1).limit(2).sort({ email: 'asc' });

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        const statement = getStatement(spans[0]);
        expect(statement.condition).toEqual({ id: '_test' });
        expect(statement.options).toEqual({ skip: 1, limit: 2, sort: { email: 1 } });
    });

    it('empty dbStatementSerializer does not create a statement attribute', async () => {
        instrumentation.disable();
        instrumentation.setConfig({ dbStatementSerializer: undefined });
        instrumentation.enable();
        await User.find({ id: '_test' });

        const spans = getSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0]);
        expect(spans[0].attributes[DatabaseAttribute.DB_STATEMENT]).toBe(undefined);
    });

    describe('responseHook', () => {
        before(() => {
            instrumentation.disable();
            instrumentation.setConfig({
                responseHook: (span, response) => span.setAttribute('db.response', JSON.stringify(response)),
            });
            instrumentation.enable();
        });

        it('responseHook works with async/await in exec patch', async () => {
            await User.deleteOne({ email: 'john.doe@example.com' });
            const spans = getSpans();
            expect(spans.length).toBe(1);
            assertSpan(spans[0]);
            expect(JSON.parse(spans[0].attributes['db.response'] as string)).toEqual({ n: 1, ok: 1, deletedCount: 1 });
        });

        it('responseHook works with callback in exec patch', (done) => {
            User.deleteOne({ email: 'john.doe@example.com' }, { lean: 1 }, () => {
                const spans = getSpans();
                expect(spans.length).toBe(1);
                assertSpan(spans[0]);
                expect(JSON.parse(spans[0].attributes['db.response'] as string)).toEqual({
                    n: 1,
                    ok: 1,
                    deletedCount: 1,
                });
                done();
            });
        });

        it('responseHook works with async/await in model methods patch', async () => {
            const document = {
                firstName: 'Test first name',
                lastName: 'Test last name',
                email: 'test@example.com',
            };
            const user: IUser = new User(document);
            const createdUser = await user.save();
            const spans = getSpans();
            expect(spans.length).toBe(1);
            assertSpan(spans[0]);
            expect(spans[0].attributes['db.response']).toEqual(JSON.stringify(createdUser));
        });

        it('responseHook works with callback in model methods patch', (done) => {
            const document = {
                firstName: 'Test first name',
                lastName: 'Test last name',
                email: 'test@example.com',
            };
            const user: IUser = new User(document);
            user.save((_err, createdUser) => {
                const spans = getSpans();
                expect(spans.length).toBe(1);
                assertSpan(spans[0]);
                expect(spans[0].attributes['db.response']).toEqual(JSON.stringify(createdUser));
                done();
            });
        });

        it('responseHook works with async/await in aggregate patch', async () => {
            await User.aggregate([
                { $match: { firstName: 'John' } },
                { $group: { _id: 'John', total: { $sum: '$amount' } } },
            ]);

            const spans = getSpans();
            expect(spans.length).toBe(1);
            assertSpan(spans[0]);
            expect(JSON.parse(spans[0].attributes['db.response'] as string)).toEqual([{ _id: 'John', total: 0 }]);
        });

        it('responseHook works with callback in aggregate patch', (done) => {
            User.aggregate([
                { $match: { firstName: 'John' } },
                { $group: { _id: 'John', total: { $sum: '$amount' } } },
            ], () => {
                const spans = getSpans();
                expect(spans.length).toBe(1);
                assertSpan(spans[0]);
                expect(JSON.parse(spans[0].attributes['db.response'] as string)).toEqual([{ _id: 'John', total: 0 }]);
                done();
            });
        });

        it('error in response hook does not fail anything', async () => {
            instrumentation.disable();
            instrumentation.setConfig({
                responseHook: () => {
                    throw new Error('some error');
                },
            });
            instrumentation.enable();
            await User.deleteOne({ email: 'john.doe@example.com' });
            const spans = getSpans();
            expect(spans.length).toBe(1);
            assertSpan(spans[0]);
        });
    });
});
