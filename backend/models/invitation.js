const { DataTypes } = require('sequelize');
const crypto = require('crypto');

module.exports = (sequelize) => {
    const Invitation = sequelize.define(
        'Invitation',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            token: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
                defaultValue: () =>
                    crypto.randomBytes(24).toString('base64url'),
            },
            inviter_user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id',
                },
            },
            resource_type: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            resource_uid: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            access_level: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            expires_at: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            max_uses: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1,
            },
            used_count: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
        },
        {
            tableName: 'invitations',
            indexes: [
                { fields: ['token'], unique: true },
                { fields: ['resource_type', 'resource_uid'] },
            ],
        }
    );

    return Invitation;
};
