import { SpanKind } from '@opentelemetry/api';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import { DatabaseAttribute } from '@opentelemetry/semantic-conventions';
import { NormalizedRequest } from '../types';

export class DynamodbServiceExtension implements ServiceExtension {
    requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
        let spanKind: SpanKind = SpanKind.CLIENT;
        let spanName: string;
        let isIncoming = false;
        const operation = request.commandName;

        const spanAttributes = {
            [DatabaseAttribute.DB_SYSTEM]: 'dynamodb',
            [DatabaseAttribute.DB_NAME]: request.commandInput?.TableName,
            [DatabaseAttribute.DB_OPERATION]: operation,
            [DatabaseAttribute.DB_STATEMENT]: JSON.stringify(request.commandInput),
        };

        return {
            isIncoming,
            spanAttributes,
            spanKind,
            spanName,
        };
    }
}
