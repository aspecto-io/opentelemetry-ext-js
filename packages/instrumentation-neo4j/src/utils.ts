import { DatabaseAttribute, GeneralAttribute } from '@opentelemetry/semantic-conventions';

export function getAttributesFromNeo4jSession(session: any) {
    const connectionHolder = session._mode === 'WRITE' ? session._writeConnectionHolder : session._readConnectionHolder;
    const address = connectionHolder._connectionProvider._address;
    const auth = connectionHolder._connectionProvider._authToken;

    const attributes = {
        [GeneralAttribute.NET_PEER_NAME]: address._host,
        [GeneralAttribute.NET_PEER_PORT]: address._port,
        [GeneralAttribute.NET_TRANSPORT]: 'IP.TCP',
        // "neo4j" is the default database name. When used, "session._database" is an empty string
        [DatabaseAttribute.DB_NAME]: session._database ? session._database : 'neo4j'
    }
    if (auth?.principal) {
        attributes[DatabaseAttribute.DB_USER] = auth.principal;
    }
    return attributes;
}