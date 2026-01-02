const { Authorizer } = require('../../lib/server/authorizer');
const { MatCode }    = require('../../models/matCode');
const { Mat }        = require('../../models/mat');
const { Match }      = require('../../models/match');
const   TestHelpers  = require('../helpers');
const { User }       = require('../../models/user');


describe('Authorizer', () =>  {
    describe('Authorizer#classForScope', () => {
        const user       = new User();
        const authorizer = new Authorizer(user);
        it ('returns a class when passed an active record class', () => {
            expect(authorizer.classForScope(User)).toEqual(User);
        });

        it ('returns a class when passed an instance of an active record class', () => {
            expect(authorizer.classForScope(user)).toEqual(User);
        });

        it ('returns `String` when passed a string', () => {
            expect(authorizer.classForScope('')).toEqual(String);
        });

    });


    /***********************************************************************************************
    * STRING PERMISSIONS
    ***********************************************************************************************/
    describe('String Permissions', () => {
        const authorizer = new Authorizer(new User());
        const action = TestHelpers.Faker.Text.randomString(10);
        it ('returns true when passed `test`', async () => {
            const can = await authorizer.can(action, 'test');
            expect(can).toBeTruthy();
        });

        it ('returns false when not passed `test`', async () => {
            const scope = TestHelpers.Faker.Text.randomString(10);
            const can   = await authorizer.can(action, scope);
            expect(can).toBeFalsy();
        });
    });


    /***********************************************************************************************
    * MAT PERMISSIONS
    ***********************************************************************************************/
    describe('Mat Permissions', () => {
        const mat1 = new Mat({id: TestHelpers.Faker.Text.randomString(10)});
        const mat2 = new Mat({id: TestHelpers.Faker.Text.randomString(10)});

        const admin  = new User();
        const viewer = new User();

        const mat1AdminCode  = new MatCode({mat_id: mat1.id, role: MatCode.ROLES.ADMIN});
        const mat1ViewerCode = new MatCode({mat_id: mat1.id, role: MatCode.ROLES.VIEWER});
        const mat2AdminCode  = new MatCode({mat_id: mat2.id, role: MatCode.ROLES.ADMIN});


        const mat1AdminAuthorizer  = new Authorizer(admin, mat1AdminCode);
        const mat2AdminAuthorizer  = new Authorizer(admin, mat2AdminCode);
        const mat1ViewerAuthorizer = new Authorizer(viewer, mat1ViewerCode);
        const noCodeAuthorizer     = new Authorizer(viewer);

        describe('assign', () => {
            it ('allows admins codes to assign', async () => {
                const can = await mat1AdminAuthorizer.can('assign', mat1);
                expect(can).toBeTruthy();
            });

            it ('does not allow admins codes from other mats to assign', async () => {
                const can = await mat2AdminAuthorizer.can('assign', mat1);
                expect(can).toBeFalsy();
            });

            it ('does not allow viewer codes to assign', async () => {
                const can = await mat1ViewerAuthorizer.can('assign', mat1);
                expect(can).toBeFalsy();
            });

            it ('requires a code to assign to a mat', async () => {
                const can = await noCodeAuthorizer.can('assign', mat1);
                expect(can).toBeFalsy();
            });
        });


        describe('create', () => {
            it ('allows admin codes to create a mat', async () => {
                const can = await mat1AdminAuthorizer.can('create', Mat);
                expect(can).toBeTruthy();
            });

            it ('allows viewer codes to create a mat', async () => {
                const can = await mat1ViewerAuthorizer.can('create', Mat);
                expect(can).toBeTruthy();
            });

            it ('does not require a code to create a mat', async () => {
                const can = await noCodeAuthorizer.can('create', Mat);
                expect(can).toBeTruthy();
            });
        });


        describe('create a match', () => {
            it ('allows admins codes to create a match', async () => {
                const can = await mat1AdminAuthorizer.can('create a match', mat1);
                expect(can).toBeTruthy();
            });

            it ('does not allow admins codes from other mats to create a match', async () => {
                const can = await mat2AdminAuthorizer.can('create a match', mat1);
                expect(can).toBeFalsy();
            });

            it ('does not allow viewer codes to create a match', async () => {
                const can = await mat1ViewerAuthorizer.can('create a match', mat1);
                expect(can).toBeFalsy();
            });

            it ('requires a code to create a match to a mat', async () => {
                const can = await noCodeAuthorizer.can('create a match', mat1);
                expect(can).toBeFalsy();
            });
        });


        describe('be assigned judge', () => {
            it ('allows users with an admin code to be assigned', async () => {
                const can = await mat1AdminAuthorizer.can('be assigned judge', mat1);
                expect(can).toBeTruthy();
            });

            it ('allows users with a viewer code to be assigned', async () => {
                const can = await mat1ViewerAuthorizer.can('be assigned judge', mat1);
                expect(can).toBeTruthy();
            });

            it ('does not require a code to be assigned', async () => {
                const can = await noCodeAuthorizer.can('be assigned judge', mat1);
                expect(can).toBeTruthy();
            });
        });


        describe('view', () => {
            it ('allows admins codes to view', async () => {
                const can = await mat1AdminAuthorizer.can('view', mat1);
                expect(can).toBeTruthy();
            });

            it ('allows admins codes from other mats to view', async () => {
                const can = await mat2AdminAuthorizer.can('view', mat1);
                expect(can).toBeTruthy();
            });

            it ('allows viewer codes to view', async () => {
                const can = await mat1ViewerAuthorizer.can('view', mat1);
                expect(can).toBeTruthy();
            });

            it ('does not require a code to view', async () => {
                const can = await noCodeAuthorizer.can('view', mat1);
                expect(can).toBeTruthy();
            });
        });
    });


    /***********************************************************************************************
    * MATCH PERMISSIONS
    ***********************************************************************************************/
    describe('Match Permissions', () => {
        const blue   = new User();
        const judge  = new User();
        const red    = new User();
        const viewer = new User();
        const match  = new Match();

        const blueAuthorizer   = new Authorizer(blue);
        const judgeAuthorizer  = new Authorizer(judge);
        const redAuthorizer    = new Authorizer(red);
        const viewerAuthorizer = new Authorizer(viewer);

        match.getJudges         = () => [judge];
        match.getRedCompetitor  = () =>  red;
        match.getBlueCompetitor = () =>  blue;


        describe('judge', () => {
            it ('allows judges to judge', async () => {
                const can = await judgeAuthorizer.can('judge', match);
                expect(can).toBeTruthy();
            });

            it ('does not allow the red competitor to judge', async () => {
                const can = await redAuthorizer.can('judge', match);
                expect(can).toBeFalsy();
            });

            it ('does not allow the blue competitor to judge', async () => {
                const can = await blueAuthorizer.can('judge', match);
                expect(can).toBeFalsy();
            });

            it ('does not allow others to judge', async () => {
                const can = await viewerAuthorizer.can('judge', match);
                expect(can).toBeFalsy();
            });
        });


        describe('manage', () => {
/*
            it ('allows admins to manage', async () => {
                const can   = await authorizer1.can('judge', match);
                expect(judgeCan).toBeTruthy();
            });

            it ('allows the red competitor to manage', async () => {
                const redCan    = await authorizer2.can('judge', match);
                expect(redCan).toBeFalsy();
            });

            it ('allows the blue competitor to manage', async () => {
                const blueCan   = await authorizer3.can('judge', match);
                expect(blueCan).toBeFalsy();
            });

            it ('allows others to manage', async () => {
                const viewerCan = await authorizer4.can('judge', match);
                expect(viewerCan).toBeFalsy();
            });
*/
        });


        describe('view', () => {
            it ('allows judges to view', async () => {
                const can = await judgeAuthorizer.can('view', match);
                expect(can).toBeTruthy();
            });

            it ('does not allow the red competitor to view', async () => {
                const can  = await redAuthorizer.can('view', match);
                expect(can).toBeTruthy();
            });

            it ('does not allow the blue competitor to view', async () => {
                const can = await blueAuthorizer.can('view', match);
                expect(can).toBeTruthy();
            });

            it ('does not allow others to view', async () => {
                const can = await viewerAuthorizer.can('view', match);
                expect(can).toBeTruthy();
            });
        });
    });


    /***********************************************************************************************
    * USER PERMISSIONS
    ***********************************************************************************************/
    describe('User Permissions', () => {
        const user1      = new User();
        const user2      = new User();
        const authorizer = new Authorizer(user1);

        describe('assign', () => {
            it ('allows users to assign themselves', async () => {
                const can = authorizer.can('assign', user1);
                expect(can).toBeTruthy();
            });

            it ('allows users to assign other users', async () => {
                const can = authorizer.can('assign', user2);
                expect(can).toBeTruthy();
            });
        });
    });
});
