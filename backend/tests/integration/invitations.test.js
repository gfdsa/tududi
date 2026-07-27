// The registration override test exercises POST /api/register, which rolls
// back user creation when the verification email cannot be sent; the email
// service is disabled in tests, so stub just the sender.
jest.mock('../../modules/auth/registrationService', () => {
    const actual = jest.requireActual('../../modules/auth/registrationService');
    return {
        ...actual,
        sendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
    };
});

const request = require('supertest');
const app = require('../../app');
const { Invitation, Setting, sequelize } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const registrationService = require('../../modules/auth/registrationService');

describe('Share Invitations', () => {
    let owner, invitee, ownerAgent, inviteeAgent, project;

    const createInvite = (overrides = {}) =>
        ownerAgent.post('/api/invitations').send({
            resource_type: 'project',
            resource_uid: project.uid,
            access_level: 'ro',
            ...overrides,
        });

    beforeEach(async () => {
        // resetMocks:true clears factory-time implementations before each test
        registrationService.sendVerificationEmail.mockResolvedValue({
            success: true,
        });

        owner = await createTestUser({
            email: `owner_${Date.now()}@test.com`,
            name: 'Owner',
            timezone: 'UTC',
        });
        invitee = await createTestUser({
            email: `invitee_${Date.now()}@test.com`,
            name: 'Invitee',
            timezone: 'UTC',
        });

        ownerAgent = request.agent(app);
        inviteeAgent = request.agent(app);
        await ownerAgent
            .post('/api/login')
            .send({ email: owner.email, password: 'password123' });
        await inviteeAgent
            .post('/api/login')
            .send({ email: invitee.email, password: 'password123' });

        const projectResponse = await ownerAgent.post('/api/project').send({
            name: 'Invited Project',
        });
        project = projectResponse.body;
    });

    afterAll(async () => {
        await sequelize.close();
    });

    describe('creating invitations', () => {
        test('owner creates an invitation and gets a link', async () => {
            const res = await createInvite();
            expect(res.status).toBe(201);
            expect(res.body.token).toBeTruthy();
            expect(res.body.url).toBe(`/invite/${res.body.token}`);
            expect(res.body.max_uses).toBe(1);
        });

        test('non-owner cannot create an invitation', async () => {
            const res = await inviteeAgent.post('/api/invitations').send({
                resource_type: 'project',
                resource_uid: project.uid,
                access_level: 'rw',
            });
            expect(res.status).toBe(403);
        });

        test('rejects invalid resource types and access levels', async () => {
            expect((await createInvite({ resource_type: 'note' })).status).toBe(
                400
            );
            expect((await createInvite({ access_level: 'admin' })).status).toBe(
                400
            );
        });

        test('requires authentication', async () => {
            const res = await request(app).post('/api/invitations').send({
                resource_type: 'project',
                resource_uid: project.uid,
                access_level: 'ro',
            });
            expect(res.status).toBe(401);
        });
    });

    describe('preview', () => {
        test('is available without authentication', async () => {
            const { token } = (await createInvite()).body;
            const res = await request(app).get(
                `/api/invitations/${token}/preview`
            );
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                resource_type: 'project',
                resource_name: 'Invited Project',
                access_level: 'ro',
                inviter_name: 'Owner',
            });
        });

        test('returns 404 for an unknown token', async () => {
            const res = await request(app).get(
                '/api/invitations/doesnotexist/preview'
            );
            expect(res.status).toBe(404);
        });
    });

    describe('accepting invitations', () => {
        test('accept grants access to the resource', async () => {
            const { token } = (await createInvite({ access_level: 'rw' })).body;

            const res = await inviteeAgent.post(
                `/api/invitations/${token}/accept`
            );
            expect(res.status).toBe(200);
            expect(res.body.resource_uid).toBe(project.uid);

            const projects = await inviteeAgent.get('/api/projects');
            const list = projects.body.projects || projects.body;
            expect(list.map((p) => p.uid)).toContain(project.uid);
        });

        test('re-accepting is idempotent and does not consume a use', async () => {
            const { token } = (await createInvite()).body;
            await inviteeAgent.post(`/api/invitations/${token}/accept`);

            const again = await inviteeAgent.post(
                `/api/invitations/${token}/accept`
            );
            expect(again.status).toBe(200);

            const row = await Invitation.findOne({ where: { token } });
            expect(row.used_count).toBe(1);
        });

        test('owner accepting their own invite is a no-op success', async () => {
            const { token } = (await createInvite()).body;
            const res = await ownerAgent.post(
                `/api/invitations/${token}/accept`
            );
            expect(res.status).toBe(200);
            const row = await Invitation.findOne({ where: { token } });
            expect(row.used_count).toBe(0);
        });

        test('an exhausted invitation cannot be accepted by another user', async () => {
            const third = await createTestUser({
                email: `third_${Date.now()}@test.com`,
                timezone: 'UTC',
            });
            const thirdAgent = request.agent(app);
            await thirdAgent
                .post('/api/login')
                .send({ email: third.email, password: 'password123' });

            const { token } = (await createInvite()).body; // max_uses 1
            await inviteeAgent.post(`/api/invitations/${token}/accept`);

            const res = await thirdAgent.post(
                `/api/invitations/${token}/accept`
            );
            expect(res.status).toBe(404);
        });

        test('multi-use invitations admit several users', async () => {
            const third = await createTestUser({
                email: `third_${Date.now()}@test.com`,
                timezone: 'UTC',
            });
            const thirdAgent = request.agent(app);
            await thirdAgent
                .post('/api/login')
                .send({ email: third.email, password: 'password123' });

            const { token } = (await createInvite({ max_uses: 2 })).body;
            expect(
                (await inviteeAgent.post(`/api/invitations/${token}/accept`))
                    .status
            ).toBe(200);
            expect(
                (await thirdAgent.post(`/api/invitations/${token}/accept`))
                    .status
            ).toBe(200);
        });

        test('an expired invitation cannot be accepted', async () => {
            const { token } = (await createInvite()).body;
            await Invitation.update(
                { expires_at: new Date(Date.now() - 1000) },
                { where: { token } }
            );
            const res = await inviteeAgent.post(
                `/api/invitations/${token}/accept`
            );
            expect(res.status).toBe(404);
        });

        test('a revoked invitation cannot be accepted', async () => {
            const { token } = (await createInvite()).body;
            const revoke = await ownerAgent.delete(`/api/invitations/${token}`);
            expect(revoke.status).toBe(204);

            const res = await inviteeAgent.post(
                `/api/invitations/${token}/accept`
            );
            expect(res.status).toBe(404);
        });
    });

    describe('listing and revoking', () => {
        test('owner lists active invitations for a resource', async () => {
            await createInvite();
            await createInvite({ access_level: 'rw' });

            const res = await ownerAgent.get(
                `/api/invitations?resource_type=project&resource_uid=${project.uid}`
            );
            expect(res.status).toBe(200);
            expect(res.body.invitations).toHaveLength(2);
            expect(res.body.invitations.every((i) => i.active)).toBe(true);
        });

        test('non-owner cannot list or revoke', async () => {
            const { token } = (await createInvite()).body;
            expect(
                (
                    await inviteeAgent.get(
                        `/api/invitations?resource_type=project&resource_uid=${project.uid}`
                    )
                ).status
            ).toBe(403);
            expect(
                (await inviteeAgent.delete(`/api/invitations/${token}`)).status
            ).toBe(403);
        });
    });

    describe('registration override', () => {
        afterEach(async () => {
            await Setting.destroy({
                where: { key: 'registration_enabled' },
            }).catch(() => {});
        });

        test('a valid invite token admits registration when self-registration is disabled', async () => {
            await Setting.upsert({
                key: 'registration_enabled',
                value: 'false',
            });

            const { token } = (await createInvite()).body;

            const denied = await request(app).post('/api/register').send({
                email: 'newcomer@example.com',
                password: 'ValidPassword123!',
            });
            expect(denied.status).toBe(404);

            const admitted = await request(app).post('/api/register').send({
                email: 'newcomer@example.com',
                password: 'ValidPassword123!',
                invite_token: token,
            });
            expect(admitted.status).toBe(201);
        });
    });
});
