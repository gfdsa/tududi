'use strict';

const { safeAddColumns } = require('../utils/migration-utils');

module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'invitations', [
            {
                name: 'email',
                definition: {
                    type: Sequelize.STRING,
                    allowNull: true,
                    defaultValue: null,
                },
            },
        ]);
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('invitations', 'email');
    },
};
