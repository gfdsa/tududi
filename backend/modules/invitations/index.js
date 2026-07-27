'use strict';

const { router, publicRouter } = require('./routes');
const service = require('./service');

module.exports = {
    routes: router,
    publicRoutes: publicRouter,
    service,
};
