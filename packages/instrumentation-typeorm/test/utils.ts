import * as typeorm from 'typeorm';

@typeorm.Entity()
export class User {
    @typeorm.PrimaryColumn()
    id: number;

    @typeorm.Column()
    firstName: string;

    @typeorm.Column()
    lastName: string;

    constructor(id: number, firstName: string, lastName: string) {
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
    }
}

export const defaultOptions: typeorm.ConnectionOptions = {
    type: 'sqlite',
    database: ':memory:',
    dropSchema: true,
    synchronize: true,
    entities: [User],
};

export const getQueryBuilder = (connection: typeorm.Connection) => {
    const testQueryRunner = {
        connection,
        query: (query: string, parameters?: any[]) => Promise.resolve([]),
    } as typeorm.QueryRunner;
    return new typeorm.SelectQueryBuilder<any>(connection, testQueryRunner).from(User, 'users');
};
