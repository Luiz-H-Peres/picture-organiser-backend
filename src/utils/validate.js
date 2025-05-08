const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const validatePassword = (password) => password.length >= 8;

module.exports = {
    validateEmail,
    validatePassword,
};