import { Logger, SpanKind } from '@opentelemetry/api';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import { DatabaseAttribute } from '@opentelemetry/semantic-conventions';

export class DynamodbServiceExtension implements ServiceExtension {
    requestHook(request: AWS.Request<any, any>): RequestMetadata {
        let spanKind: SpanKind = SpanKind.CLIENT;
        let spanName: string;
        let isIncoming = false;
        const operation = (request as any)?.operation;

        const spanAttributes = {
            [DatabaseAttribute.DB_SYSTEM]: 'dynamodb',
            [DatabaseAttribute.DB_NAME]: (request as any)?.params?.TableName,
            [DatabaseAttribute.DB_OPERATION]: operation,
            [DatabaseAttribute.DB_STATEMENT]: JSON.stringify((request as any)?.params),
        };

        return {
            isIncoming,
            spanAttributes,
            spanKind,
            spanName,
        };
    }
}
