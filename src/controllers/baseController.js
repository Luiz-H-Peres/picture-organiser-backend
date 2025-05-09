const { getDbClient } = require("../services/database");

/**
 * A generic controller wrapper for API routes.
 * It handles required field validation, authentication checks,
 * database connection, and uniform error responses.
 */
async function baseController({ req, res, required, requiredAuth, callback }) {
    try {
        // Ensure essential request and response objects exist
        if (!res) {
            throw new Error('Response object is missing');
        }

        if (!req) {
            throw new Error('Request object is missing');
        }

        // Authentication check if required
        if (requiredAuth && !req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Combine body and params into one object
        const body = { ...req.body, ...req.params };
        const user = req.user;

        // Validate required fields
        required?.forEach(key => {
            if (!body[key]) {
                const err = new Error(`${key} is missing`);
                err.code = 400;
                throw err;
            }
        });

        // Get the database client
        const db = await getDbClient();

        // Execute the route logic callback
        const response = await callback({ db, body, user, req, res });

        // Respond with success
        return res.status(200).json(response);

    } catch (error) {
        // Clean and safe error logging
        console.error('Error:', {
            body: { ...req.body, ...req.params },
            error: error.message || error
        });

        // Ensure we return a numeric status code only
        const statusCode = typeof error.code === 'number' ? error.code : 500;

        // Send a uniform error response
        return res.status(statusCode).json({
            error: error.message || 'Internal Server Error'
        });
    }
}

module.exports = {
    baseController
};
