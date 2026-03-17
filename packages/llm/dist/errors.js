export class LLMError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'LLMError';
        this.code = code;
    }
}
