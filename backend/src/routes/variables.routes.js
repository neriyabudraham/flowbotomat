const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { getVariables, createVariable, updateVariable, deleteVariable } = require('../controllers/variables/variables.controller');

// All routes require authentication
router.use(authMiddleware);

// Get all variables (system + user-defined)
router.get('/', getVariables);

// Create a new variable
router.post('/', createVariable);

// Update a variable
router.put('/:id', updateVariable);

// Delete a variable
router.delete('/:id', deleteVariable);

module.exports = router;
