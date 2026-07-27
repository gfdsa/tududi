'use strict';

const invitationsService = require('./service');
const { getAuthenticatedUserId } = require('../../utils/request-utils');
const { UnauthorizedError } = require('../../shared/errors');

function requireUserId(req) {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        throw new UnauthorizedError('Authentication required');
    }
    return userId;
}

const invitationsController = {
    /**
     * POST /api/invitations
     */
    async create(req, res, next) {
        try {
            const userId = requireUserId(req);
            const invitation = await invitationsService.createInvitation(
                userId,
                req.body
            );
            res.status(201).json(invitation);
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/invitations?resource_type=&resource_uid=
     */
    async list(req, res, next) {
        try {
            const userId = requireUserId(req);
            const invitations = await invitationsService.listInvitations(
                userId,
                req.query.resource_type,
                req.query.resource_uid
            );
            res.json({ invitations });
        } catch (error) {
            next(error);
        }
    },

    /**
     * DELETE /api/invitations/:token
     */
    async revoke(req, res, next) {
        try {
            const userId = requireUserId(req);
            await invitationsService.revokeInvitation(userId, req.params.token);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/invitations/:token/preview — unauthenticated.
     */
    async preview(req, res, next) {
        try {
            const preview = await invitationsService.previewInvitation(
                req.params.token
            );
            res.json(preview);
        } catch (error) {
            next(error);
        }
    },

    /**
     * POST /api/invitations/:token/accept
     */
    async accept(req, res, next) {
        try {
            const userId = requireUserId(req);
            const result = await invitationsService.acceptInvitation(
                userId,
                req.params.token
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    },
};

module.exports = invitationsController;
