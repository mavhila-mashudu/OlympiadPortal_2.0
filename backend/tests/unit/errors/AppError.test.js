const {
    AppError,
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    ValidationError,
} = require('../../../src/errors/AppError');

describe('AppError', () => {
    it('stores the message and status code and marks itself operational', () => {
        const err = new AppError('Boom', 418);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Boom');
        expect(err.statusCode).toBe(418);
        expect(err.isOperational).toBe(true);
        expect(err.stack).toEqual(expect.any(String));
    });
});

describe.each([
    [BadRequestError, 400, 'Bad request'],
    [UnauthorizedError, 401, 'Not authenticated'],
    [ForbiddenError, 403, 'Not authorized'],
    [NotFoundError, 404, 'Resource not found'],
    [ConflictError, 409, 'Resource already exists'],
    [ValidationError, 422, 'Validation failed'],
])('%p', (ErrorClass, statusCode, defaultMessage) => {
    it(`uses status ${statusCode} and a default message`, () => {
        const err = new ErrorClass();
        expect(err.statusCode).toBe(statusCode);
        expect(err.message).toBe(defaultMessage);
    });

    it('accepts a custom message', () => {
        expect(new ErrorClass('Custom').message).toBe('Custom');
    });

    it('is an operational AppError', () => {
        const err = new ErrorClass();
        expect(err).toBeInstanceOf(AppError);
        expect(err.isOperational).toBe(true);
    });
});
