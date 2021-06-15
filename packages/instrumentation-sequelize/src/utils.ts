export const extractTableFromQuery = (query: string) => {
    try {
        const result = query?.match(/(?<=from|join|truncate)\s+\"?\`?(\w+)\"?\`?/gi);
        if (!Array.isArray(result)) return;

        return result
            .map((table) =>
                table
                    .trim()
                    .replace(/^"(.*)"$/, '$1')
                    .replace(/^`(.*)`$/, '$1')
            )
            .join(',');
    } catch {
        return;
    }
};
