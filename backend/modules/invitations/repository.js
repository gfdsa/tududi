'use strict';

const { Invitation, User, Project, Area } = require('../../models');

class InvitationsRepository {
    async create(data) {
        return Invitation.create(data);
    }

    async findByToken(token) {
        return Invitation.findOne({ where: { token } });
    }

    async findByResource(resourceType, resourceUid) {
        return Invitation.findAll({
            where: { resource_type: resourceType, resource_uid: resourceUid },
            order: [['created_at', 'DESC']],
            raw: true,
        });
    }

    async findInviter(userId) {
        return User.findByPk(userId, {
            attributes: ['id', 'email', 'name', 'surname'],
            raw: true,
        });
    }

    /**
     * Resolve the shared resource. Area support depends on the deployment —
     * on installations without the Area model in sharing, area invitations
     * are simply never created.
     */
    async findResource(resourceType, resourceUid) {
        if (resourceType === 'project') {
            return Project.findOne({
                where: { uid: resourceUid },
                attributes: ['uid', 'name', 'user_id'],
                raw: true,
            });
        }
        if (resourceType === 'area') {
            return Area.findOne({
                where: { uid: resourceUid },
                attributes: ['uid', 'name', 'user_id'],
                raw: true,
            });
        }
        return null;
    }
}

module.exports = new InvitationsRepository();
