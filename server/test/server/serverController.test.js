const { AuthorizationError }   = require('../../lib/server/serverController');
const { BarController }        = require('./helpers/controllers/barController');
const { FooController }        = require('./helpers/controllers/fooController');
const { camelize }             = require('inflection');
const   TestHelpers            = require('../helpers');


describe('ServerController', () => {
    describe('ServerController.actionNames', () => {
        it ('returns actions based on method names', () => {
            const names      = FooController.actionNames;
            const expected   = ['postIndex',
                                'getFooBar',
                                'getBazBan',
                                'postFooBar',
                                'putFooBar',
                                'deleteFooBar',
                                'patchFooBar'];
            expect(names).toEqual(expected);
        });
    });


    describe('ServerController._constructAction', () => {
        it ('returns an object with path, method, and action', () => {
            const expected   = {
              method: 'GET',
              path:   '/foo/fooBar',
              action: 'getFooBar'
            }
            expect(FooController._constructAction('getFooBar', '')).toEqual(expected);
        });

        it ('uses a blank path for index actions', () => {
            const expected   = {
              method: 'POST',
              path:   '/foo',
              action: 'postIndex'
            }
            expect(FooController._constructAction('postIndex', '')).toEqual(expected);
        });

        it ('uses a custom path when defined', () => {
            const expected   = {
              method: 'GET',
              path:   '/baz/:id/ban',
              action: 'getBazBan'
            }
            expect(FooController._constructAction('getBazBan', '')).toEqual(expected);
        });
    });


    describe('ServerController.validateParameters', () => {
        const paramName1      = TestHelpers.Faker.Text.randomString(10);
        const paramName2      = TestHelpers.Faker.Text.randomString(10);
        const value1          = TestHelpers.Faker.Text.randomString(10);
        const value2          = TestHelpers.Faker.Text.randomString(10);
        const params          = {[paramName1]: value1, [paramName2]: value2};
        const validationType1 = TestHelpers.Faker.Text.randomString(10);
        const validationType2 = TestHelpers.Faker.Text.randomString(10);
        const options1        = [TestHelpers.Faker.Text.randomString(10)];
        const options2        = [TestHelpers.Faker.Text.randomString(10)];
        const error1          = TestHelpers.Faker.Text.randomString(10)
        const error2          = TestHelpers.Faker.Text.randomString(10)

        let controller;
        let response;
        let validator1;
        let validator2;
        beforeEach(() => {
            response                                           = {json: jest.fn(), statusCode: 200};
            controller                                         = new FooController({params}, response);
            controller.render                                  = jest.fn();
            validator1                                         = jest.fn();
            validator2                                         = jest.fn();
            controller[`validate${camelize(validationType1)}`] = validator1;
            controller[`validate${camelize(validationType2)}`] = validator2;
        });

        const validations = {
            [paramName1]: {[validationType1]: options1, [validationType2]: options2},
            [paramName2]: {[validationType1]: options2}
        };

        it ('runs validation checkers based on inputs', () => {
            controller.validateParameters(validations);
            expect(validator1).toBeCalledTimes(2);
            expect(validator1).toBeCalledWith(value1, options1);
            expect(validator1).toBeCalledWith(value2, options2);

            expect(validator2).toBeCalledTimes(1);
            expect(validator2).toBeCalledWith(value1, options2);
        });

        it ('sets the error status when there\'s an error', () => {
            validator1.mockImplementation(() => error1);
            controller.validateParameters(validations);
            expect(controller.render).toHaveBeenCalledTimes(1);
            const expected = {errors: {
                [paramName1]: [error1],
                [paramName2]: [error1]
            }};
            expect(controller.render).toHaveBeenCalledWith(expected);
            expect(response.statusCode).toEqual(400);
        });

        it ('sets the error status when there are multiple errors', () => {
            validator1.mockImplementation(() => error1);
            validator2.mockImplementation(() => error2);
            controller.validateParameters(validations);
            expect(controller.render).toHaveBeenCalledTimes(1);
            const expected = {errors: {
                [paramName1]: [error1, error2],
                [paramName2]: [error1]
            }};
            expect(controller.render).toHaveBeenCalledWith(expected);
            expect(response.statusCode).toEqual(400);
        });

        it ('sets nothing when there is no error', () => {
            controller.validateParameters(validations);
            expect(controller.render).toHaveBeenCalledTimes(0);
            expect(response.statusCode).toEqual(200);
        });
    });


    describe('ServerController.validatePresence', () => {
        const controller = new FooController({}, {});
        it ('returns undefined when there is a value', () => {
            const result = controller.validatePresence(TestHelpers.Faker.Text.randomString());
            expect(result).toBe(undefined);
        });

        it ('returns an error when there is no value', () => {
            const result = controller.validatePresence();
            expect(result).toEqual('required');
        });
    });


    describe('ServerController.validateIsInteger', () => {
        const controller = new FooController({}, {});
        it ('returns undefined when there is an integer', () => {
            const val    = Math.ceil(Math.random() * 100);
            const result = controller.validateIsInteger(val)
            expect(result).toEqual(undefined);
        });

        it ('returns undefined when there is an integer string', () => {
            const val    = Math.ceil(Math.random() * 100).toString();
            const result = controller.validateIsInteger(val)
            expect(result).toEqual(undefined);
        });

        it ('returns an error when there is a non integer number', () => {
            const val    = Math.random() * 100;
            const result = controller.validateIsInteger(val)
            expect(result).toEqual('must be an integer');
        });

        it ('returns an error when there is a non integer string', () => {
            // starts with a number because parseFloat converts a string to a float if it starts with a number
            const val    = '1' + TestHelpers.Faker.Text.randomString(10);
            const result = controller.validateIsInteger(val)
            expect(result).toEqual('must be an integer');
        });

        it ('returns an error when the number is less than the gte option', () => {
            const result = controller.validateIsInteger(1, {gte: 2});
            expect(result).toEqual('must be greater than or equal to 2');
        });

        it ('returns undefined when the number is greater than the gte option', () => {
            const result = controller.validateIsInteger(3, {gte: 2});
            expect(result).toEqual(undefined);
        });

        it ('returns undefined when the number is equal to the gte option', () => {
            const result = controller.validateIsInteger(2, {gte: 2});
            expect(result).toEqual(undefined);
        });
    });


    describe('ServerController.validateIsDateTime', () => {
        const controller = new FooController({}, {});
        it ('returns undefined when passed a string of format YYYY-MM-DD', () => {
            const result = controller.validateIsDateTime('2025-12-17');
            expect(result).toBe(undefined);
        });

        it ('returns undefined when passed a string of format MM/DD/YY', () => {
            const result = controller.validateIsDateTime('12/17/25');
            expect(result).toBe(undefined);
        });

        it ('returns undefined when passed a string of format Month name DD, YYY', () => {
            const result = controller.validateIsDateTime('December 17, 2025');
            expect(result).toBe(undefined);
        });

        it ('returns undefined when passed a string of format YYYY-MM-DD HH:MM:SS', () => {
            const result = controller.validateIsDateTime('2025-12-17 01:05:00');
            expect(result).toBe(undefined);
        });

        it ('returns undefined when passed a string of format MM/DD/YY', () => {
            const result = controller.validateIsDateTime('12/17/25 01:05:00');
            expect(result).toBe(undefined);
        });

        it ('returns undefined when passed a string of format Month name DD, YYY', () => {
            const result = controller.validateIsDateTime('December 17, 2025 01:05:00');
            expect(result).toBe(undefined);
        });

        it ('returns an error when passed an invalid date', () => {
            const result = controller.validateIsDateTime('foo');
            expect(result).toEqual('invalid date');
        });
    });


    describe('ServerController.validateIsEnum', () => {
        const controller = new FooController({}, {});
        const enums      = [Math.random(), Math.random(), Math.random()];
        const error      = TestHelpers.Faker.Text.randomString(10);
        const options    = { enums, error }
        it ('returns undefined when passed a valid value', () => {
            const result = controller.validateIsEnum(enums[2], options);
            expect(result).toBe(undefined);
        });

        it ('returns an error when passed an invalid date', () => {
            const result = controller.validateIsEnum('foo', options);
            expect(result).toBe(error);
        });
    });


    describe('ServerController.validateIsEmail', () => {
        const controller = new FooController({}, {});

        it ('does not error on valid emails', () => {
            const result = controller.validateIsEmail('bob@bayjiujitsu.com');
            expect(result).toBe(undefined);
        });

        it ('supports subdomains', () => {
            const result = controller.validateIsEmail('bob@bay.jiujitsu.com');
            expect(result).toBe(undefined);

        });

        it ('returns an error for invalid emails', () => {
            const result = controller.validateIsEmail('foo');
            expect(result).toBe('invalid email');
        });
    });


    describe('ServerController.validateFunction', () => {
        const controller   = new FooController({}, {});
        const correctValue = Math.random();
        const error        = TestHelpers.Faker.Text.randomString();
        const validator    = (value) => value == correctValue ? undefined : error;

        it ('returns undefiend when passed a valid value', () => {
            const result = controller.validateFunction(correctValue, validator);
            expect(result).toBe(undefined);
        });

        it ('returns undefiend when passed a valid value', () => {
            const result = controller.validateFunction(Math.random(), validator);
            expect(result).toBe(error);
        });
    });


    describe('ServerController.authorize', () => {
        const user               = {};
        const controllerWithUser = new FooController({}, {});
        const currentUserSpy     = jest.spyOn(controllerWithUser, 'currentUser', 'get');
        currentUserSpy.mockImplementation(() => user);

        it ('throws an error when there is no `currentUser`', async () => {
            const controller = new FooController({}, {});
            await expect(async () => {
                await controller.authorize('view', 'test')
            }).rejects.toThrow(AuthorizationError);
        });

        it ('does not throw an error when the `currentUser` is authorized', async () => {
            await controllerWithUser.authorize('view', 'test');
        });

        it ('throws an error when the `currentUser` is not authorized', async () => {
            const controller = new FooController({}, {});
            await expect(async () => {
                await controller.authorize('view', 'foo')
            }).rejects.toThrow(AuthorizationError);
        });
    });
});
