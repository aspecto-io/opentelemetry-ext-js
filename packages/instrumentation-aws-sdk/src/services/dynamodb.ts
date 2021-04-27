import { SpanKind } from '@opentelemetry/api';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { NormalizedRequest } from '../types';

export class DynamodbServiceExtension implements ServiceExtension {
    requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
        let spanKind: SpanKind = SpanKind.CLIENT;
        let spanName: string;
        let isIncoming = false;
        const operation = request.commandName;

        const spanAttributes = {
            [SemanticAttributes.DB_SYSTEM]: 'dynamodb',
            [SemanticAttributes.DB_NAME]: request.commandInput?.TableName,
            [SemanticAttributes.DB_OPERATION]: operation,
            [SemanticAttributes.DB_STATEMENT]: JSON.stringify(request.commandInput),
        };

        return {
            isIncoming,
            spanAttributes,
            spanKind,
            spanName,
        };
    }
}
