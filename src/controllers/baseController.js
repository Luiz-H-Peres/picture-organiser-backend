const { getDbClient } = require("../services/database");

async function baseController({ req, res, required, requiredAuth, callback }) {
    try {

        if (!res) {
            throw new Error('Response object is missing');
        }

        if (!req) {
            throw new Error('Request object is missing');
        }

        if (requiredAuth) {
            if (!req.user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
        }

        const body = { ...req.body, ...req.params };
        const user = req.user;

        required?.forEach(key => {
            if (!body[key]) {
                throw new Error(`${key} is missing`);
            }
        });

        const db = await getDbClient();

        const response = await callback({ db, body, user });
        return res.status(200).json(response);

    } catch (error) {
        console.error('Error:', { body: { ...req.body, ...req.params }, error });

        const { code, message } = error;

        return res.status(code ?? 500).json({ error: message ?? 'Internal Server Error' });
    }
}

module.exports = {
    baseController
};