'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('invitations', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            token: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true,
            },
            inviter_user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            resource_type: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            resource_uid: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            access_level: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            expires_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
            max_uses: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 1,
            },
            used_count: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
        });
        await queryInterface.addIndex('invitations', ['token'], {
            unique: true,
        });
        await queryInterface.addIndex('invitations', [
            'resource_type',
            'resource_uid',
        ]);
    },

    async down(queryInterface) {
        await queryInterface.dropTable('invitations');
    },
};
