jest.mock('express-validator', () => ({ validationResult: jest.fn() }));

const { validationResult } = require('express-validator');
const validate = require('../../../src/middlewares/validate');
const { ValidationError } = require('../../../src/errors/AppError');
const { mockReq, mockRes } = require('../helpers/http');

const resultWith = (errors) => ({
    isEmpty: () => errors.length === 0,
    array: () => errors,
});

describe('validate', () => {
    it('calls next with no error when validation passed', () => {
        validationResult.mockReturnValue(resultWith([]));
        const next = jest.fn();
        validate(mockReq(), mockRes(), next);
        expect(next).toHaveBeenCalledWith();
    });

    it('reads the validation result from the request', () => {
        validationResult.mockReturnValue(resultWith([]));
        const req = mockReq();
        validate(req, mockRes(), jest.fn());
        expect(validationResult).toHaveBeenCalledWith(req);
    });

    it('forwards a 422 ValidationError joining every message', () => {
        validationResult.mockReturnValue(
            resultWith([{ msg: 'Min 8 characters' }, { msg: 'Needs a number' }])
        );
        const next = jest.fn();
        validate(mockReq(), mockRes(), next);

        const err = next.mock.calls[0][0];
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.statusCode).toBe(422);
        expect(err.message).toBe('Min 8 characters, Needs a number');
    });
});
