const errorHandler = require('../../../src/middlewares/errorHandler');
const {
    NotFoundError,
    ValidationError,
} = require('../../../src/errors/AppError');
const { mockReq, mockRes } = require('../helpers/http');

const handle = (err) => {
    const res = mockRes();
    errorHandler(err, mockReq({ url: '/x', method: 'GET' }), res, jest.fn());
    return res;
};

const expectResponse = (res, status, error) => {
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ success: false, error });
};

describe('errorHandler', () => {
    const originalEnv = process.env.NODE_ENV;
    let consoleError;

    beforeEach(() => {
        consoleError = jest
            .spyOn(console, 'error')
            .mockImplementation(() => {});
    });
    afterEach(() => {
        process.env.NODE_ENV = originalEnv;
        consoleError.mockRestore();
    });

    it("returns an operational error's own status and message", () => {
        expectResponse(
            handle(new NotFoundError('Round not found')),
            404,
            'Round not found'
        );
    });

    it('returns 422 for validation errors', () => {
        expectResponse(
            handle(new ValidationError('Needs a number')),
            422,
            'Needs a number'
        );
    });

    it("maps an id that isn't a valid UUID to 400", () => {
        const err = {
            code: 'P2007',
            message:
                'Invalid `prisma.rounds.findUnique()` invocation in C:/src/services/roundService.js',
            meta: { driverAdapterError: { cause: { originalCode: '22P02' } } },
        };
        expectResponse(handle(err), 400, 'Invalid ID format');
    });

    it("doesn't treat other Prisma validation errors as a bad id", () => {
        process.env.NODE_ENV = 'production';
        const err = {
            code: 'P2007',
            message: 'raw',
            meta: { driverAdapterError: { cause: { originalCode: '22001' } } },
        };
        expectResponse(handle(err), 500, 'Something went wrong');
    });

    it('maps malformed JSON to 400 and an oversized body to 413', () => {
        expectResponse(
            handle({
                type: 'entity.parse.failed',
                status: 400,
                message: 'Unexpected token',
            }),
            400,
            'Malformed JSON in request body'
        );
        expectResponse(
            handle({
                type: 'entity.too.large',
                status: 413,
                message: 'too large',
            }),
            413,
            'Request body is too large'
        );
    });

    it('maps upload errors: too large to 413, anything else to 400', () => {
        expectResponse(
            handle({
                name: 'MulterError',
                code: 'LIMIT_FILE_SIZE',
                message: 'File too large',
            }),
            413,
            'File is too large (maximum 20MB)'
        );
        expectResponse(
            handle({
                name: 'MulterError',
                code: 'LIMIT_UNEXPECTED_FILE',
                message: 'Unexpected field',
            }),
            400,
            'Upload rejected: Unexpected field'
        );
    });

    it('maps a Prisma unique-constraint error (P2002) to 409', () => {
        expectResponse(
            handle({ code: 'P2002', message: 'raw' }),
            409,
            'A record with that value already exists'
        );
    });

    it.each(['P2003', 'P2039'])(
        'maps a foreign-key violation (%s) to 409',
        (code) => {
            expectResponse(
                handle({ code, message: 'raw' }),
                409,
                'This record is still referenced by other records'
            );
        }
    );

    it('maps a Prisma record-not-found error (P2025) to 404', () => {
        expectResponse(
            handle({ code: 'P2025', message: 'raw' }),
            404,
            'Record not found'
        );
    });

    it('maps an invalid JWT to 401', () => {
        expectResponse(
            handle({ name: 'JsonWebTokenError' }),
            401,
            'Invalid token'
        );
    });

    it('maps an expired JWT to 401', () => {
        expectResponse(
            handle({ name: 'TokenExpiredError' }),
            401,
            'Token expired'
        );
    });

    it('hides unexpected error details in production', () => {
        process.env.NODE_ENV = 'production';
        expectResponse(
            handle(new Error('SQL syntax near password')),
            500,
            'Something went wrong'
        );
    });

    it('shows unexpected error details outside production', () => {
        process.env.NODE_ENV = 'development';
        expectResponse(
            handle(new Error('SQL syntax near password')),
            500,
            'SQL syntax near password'
        );
    });

    it('logs the stack trace only in development', () => {
        const err = new Error('boom');

        process.env.NODE_ENV = 'development';
        handle(err);
        expect(consoleError).toHaveBeenLastCalledWith(
            expect.objectContaining({
                message: 'boom',
                stack: err.stack,
                url: '/x',
                method: 'GET',
            })
        );

        process.env.NODE_ENV = 'production';
        handle(err);
        expect(consoleError).toHaveBeenLastCalledWith(
            expect.objectContaining({ stack: undefined })
        );
    });
});
