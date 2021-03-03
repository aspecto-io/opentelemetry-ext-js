import { QueryResult } from 'neo4j-driver';

export const normalizeResponse = (response: QueryResult) => {
    return JSON.stringify(
        response.records.map((r) => {
            const asObject = r.toObject();
            r.keys.forEach((key) => delete asObject[key as any].identity);

            return asObject;
        })
    );
};
