const bodyParser = require('body-parser');

const serverConfig = (app) => {

    app.use(bodyParser.json({ limit: '10mb' })); // Increase payload size limit for base64 images
}

module.exports = serverConfig;