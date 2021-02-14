import { TextMapGetter } from '@opentelemetry/api';

/*
same as open telemetry's `defaultTextMapGetter`, 
but also handle case where header is buffer, 
adding toString() to make sure string is returned
*/
export const bufferTextMapGetter: TextMapGetter = {
    get(carrier, key) {
        return carrier?.[key]?.toString();
    },

    keys(carrier) {
        return carrier ? Object.keys(carrier) : [];
    },
};
