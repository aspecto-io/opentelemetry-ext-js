import {
    SEMATTRS_DB_NAME,
    SEMATTRS_DB_USER,
    SEMATTRS_NET_PEER_NAME,
    SEMATTRS_NET_PEER_PORT,
    SEMATTRS_NET_TRANSPORT,
    SemanticAttributes,
} from '@opentelemetry/semantic-conventions';

export function getAttributesFromNeo4jSession(session: any) {
    const connectionHolder =
        (session._mode === 'WRITE' ? session._writeConnectionHolder : session._readConnectionHolder) ??
        session._connectionHolder ??
        {};
    const connectionProvider = connectionHolder._connectionProvider ?? {};

    // seedRouter is used when connecting to a url that starts with "neo4j", usually aura
    const address = connectionProvider._address ?? connectionProvider._seedRouter;
    const auth = connectionProvider._authToken;

    const attributes = {
        [SEMATTRS_NET_TRANSPORT]: 'IP.TCP',
        // "neo4j" is the default database name. When used, "session._database" is an empty string
        [SEMATTRS_DB_NAME]: session._database ? session._database : 'neo4j',
    };
    if (address) {
        attributes[SEMATTRS_NET_PEER_NAME] = address._host;
        attributes[SEMATTRS_NET_PEER_PORT] = address._port;
    }
    if (auth?.principal) {
        attributes[SEMATTRS_DB_USER] = auth.principal;
    }
    return attributes;
}
