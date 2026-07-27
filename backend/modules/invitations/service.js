'use strict';

const invitationsRepository = require('./repository');
const sharesRepository = require('../shares/repository');
const { execAction } = require('../../services/execAction');
const { isAdmin } = require('../../services/rolesService');
const permissionsService = require('../../services/permissionsService');
const {
    ValidationError,
    NotFoundError,
    ForbiddenError,
} = require('../../shared/errors');

const RESOURCE_TYPES = ['project', 'area'];
const ACCESS_LEVELS = ['ro', 'rw'];
const DEFAULT_TTL_DAYS = 14;

function displayName(user) {
    if (!user) return null;
    return (
        [user.name, user.surname].filter(Boolean).join(' ').trim() || user.email
    );
}

class InvitationsService {
    async createInvitation(userId, data) {
        const {
            resource_type,
            resource_uid,
            access_level,
            expires_in_days,
            email,
        } = data;

        if (!RESOURCE_TYPES.includes(resource_type)) {
            throw new ValidationError('Invalid resource type');
        }
        if (!ACCESS_LEVELS.includes(access_level)) {
            throw new ValidationError('Invalid access level');
        }

        // The shares repository is the capability gate: invitations exist for
        // exactly the resource types the sharing system can grant. Deployments
        // whose sharing supports areas get area invitations automatically.
        const ownerRow = await sharesRepository.findResourceOwner(
            resource_type,
            resource_uid
        );
        if (!ownerRow) {
            throw new NotFoundError('Resource not found');
        }
        const resource = await invitationsRepository.findResource(
            resource_type,
            resource_uid
        );
        if (!resource) {
            throw new NotFoundError('Resource not found');
        }
        if (resource.user_id !== userId && !(await isAdmin(userId))) {
            throw new ForbiddenError('Forbidden');
        }

        const ttlDays =
            Number.isInteger(expires_in_days) &&
            expires_in_days > 0 &&
            expires_in_days <= 90
                ? expires_in_days
                : DEFAULT_TTL_DAYS;
        // email set: personal invitation (only that account, single
        // acceptance). email empty: shareable link (anyone, multi-use
        // until expiry).
        let normalizedEmail = null;
        if (email != null && String(email).trim() !== '') {
            normalizedEmail = String(email).trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
                throw new ValidationError('Invalid email address');
            }
        }

        const invitation = await invitationsRepository.create({
            inviter_user_id: resource.user_id,
            resource_type,
            resource_uid,
            access_level,
            email: normalizedEmail,
            expires_at: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
            max_uses: 1,
        });

        return {
            token: invitation.token,
            url: `/invite/${invitation.token}`,
            expires_at: invitation.expires_at,
            email: invitation.email,
        };
    }

    async listInvitations(userId, resourceType, resourceUid) {
        if (!resourceType || !resourceUid) {
            throw new ValidationError('Missing parameters');
        }
        const resource = await invitationsRepository.findResource(
            resourceType,
            resourceUid
        );
        if (!resource) {
            throw new NotFoundError('Resource not found');
        }
        if (resource.user_id !== userId && !(await isAdmin(userId))) {
            throw new ForbiddenError('Forbidden');
        }

        const rows = await invitationsRepository.findByResource(
            resourceType,
            resourceUid
        );
        const now = Date.now();
        return rows.map((r) => ({
            token: r.token,
            access_level: r.access_level,
            expires_at: r.expires_at,
            email: r.email,
            used_count: r.used_count,
            active:
                new Date(r.expires_at).getTime() > now &&
                (!r.email || r.used_count < 1),
        }));
    }

    async revokeInvitation(userId, token) {
        const invitation = await invitationsRepository.findByToken(token);
        if (!invitation) {
            throw new NotFoundError('Invitation not found');
        }
        if (invitation.inviter_user_id !== userId && !(await isAdmin(userId))) {
            throw new ForbiddenError('Forbidden');
        }
        await invitation.destroy();
        return null;
    }

    /**
     * Validate a token and return the invitation together with its resource.
     * Used by preview, accept, and the registration override.
     */
    async validateToken(token) {
        const invitation = await invitationsRepository.findByToken(token);
        if (!invitation) {
            throw new NotFoundError('Invitation not found');
        }
        if (new Date(invitation.expires_at).getTime() <= Date.now()) {
            throw new NotFoundError('Invitation has expired');
        }
        // Personal invitations are single-acceptance; link invitations stay
        // valid until they expire.
        if (invitation.email && invitation.used_count >= 1) {
            throw new NotFoundError('Invitation has already been used');
        }

        const ownerRow = await sharesRepository.findResourceOwner(
            invitation.resource_type,
            invitation.resource_uid
        );
        const resource = ownerRow
            ? await invitationsRepository.findResource(
                  invitation.resource_type,
                  invitation.resource_uid
              )
            : null;
        if (!resource) {
            throw new NotFoundError('The shared resource no longer exists');
        }
        // The inviter must still own the resource, otherwise a stale invite
        // could grant access on behalf of a previous owner.
        if (resource.user_id !== invitation.inviter_user_id) {
            throw new NotFoundError('Invitation is no longer valid');
        }

        return { invitation, resource };
    }

    /**
     * Public (unauthenticated) info for the invite landing page.
     */
    async previewInvitation(token) {
        const { invitation, resource } = await this.validateToken(token);
        const inviter = await invitationsRepository.findInviter(
            invitation.inviter_user_id
        );
        return {
            resource_type: invitation.resource_type,
            resource_name: resource.name,
            access_level: invitation.access_level,
            inviter_name: displayName(inviter),
            invited_email: invitation.email,
        };
    }

    /**
     * Grant the invited share to the (authenticated) accepting user.
     * Idempotent: accepting your own resource or an existing share succeeds.
     */
    async acceptInvitation(user, token) {
        const userId = user.id;
        const invitation = await invitationsRepository.findByToken(token);
        if (!invitation) {
            throw new NotFoundError('Invitation not found');
        }

        // Personal invitations may only be accepted by the invited account.
        if (
            invitation.email &&
            invitation.email !== (user.email || '').toLowerCase()
        ) {
            throw new ForbiddenError(
                'This invitation was issued for a different account.'
            );
        }

        // The owner and users already holding a share succeed even on an
        // expired or exhausted invitation — revisiting a link must neither
        // fail nor consume a use. Checked against the permission rows
        // directly (getAccess would short-circuit for admins, who still
        // need a real share row to see the resource in their lists).
        const resource = await invitationsRepository.findResource(
            invitation.resource_type,
            invitation.resource_uid
        );
        if (resource) {
            const sharedUids = await permissionsService.getSharedUidsForUser(
                invitation.resource_type,
                userId
            );
            if (
                resource.user_id === userId ||
                sharedUids.includes(invitation.resource_uid)
            ) {
                return {
                    resource_type: invitation.resource_type,
                    resource_uid: invitation.resource_uid,
                    resource_name: resource.name,
                };
            }
        }

        await this.validateToken(token);

        await execAction({
            verb: 'share_grant',
            actorUserId: invitation.inviter_user_id,
            targetUserId: userId,
            resourceType: invitation.resource_type,
            resourceUid: invitation.resource_uid,
            accessLevel: invitation.access_level,
        });
        await invitation.increment('used_count');

        return {
            resource_type: invitation.resource_type,
            resource_uid: invitation.resource_uid,
            resource_name: resource.name,
        };
    }

    /**
     * True when the token permits registration even while self-registration
     * is disabled. Never throws.
     */
    async allowsRegistration(token, email) {
        if (!token) return false;
        try {
            const { invitation } = await this.validateToken(token);
            // A personal invitation only admits registration of the invited
            // address.
            if (
                invitation.email &&
                invitation.email !== (email || '').trim().toLowerCase()
            ) {
                return false;
            }
            return true;
        } catch {
            return false;
        }
    }
}

module.exports = new InvitationsService();
