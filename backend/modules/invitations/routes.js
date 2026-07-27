'use strict';

const express = require('express');
const invitationsController = require('./controller');
const { authLimiter } = require('../../middleware/rateLimiter');

// Authenticated routes (mounted behind requireAuth)
const router = express.Router();
router.post('/invitations', invitationsController.create);
router.get('/invitations', invitationsController.list);
router.delete('/invitations/:token', invitationsController.revoke);
router.post('/invitations/:token/accept', invitationsController.accept);

// Public routes (mounted before requireAuth): the invite landing page must
// show what the visitor was invited to before they authenticate.
const publicRouter = express.Router();
publicRouter.get(
    '/invitations/:token/preview',
    authLimiter,
    invitationsController.preview
);

module.exports = { router, publicRouter };
