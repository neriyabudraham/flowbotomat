const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { 
  getValidations, 
  createValidation, 
  updateValidation,
  deleteValidation,
  testValidation
} = require('../controllers/validations/validations.controller');

router.get('/', authMiddleware, getValidations);
router.post('/', authMiddleware, createValidation);
router.put('/:id', authMiddleware, updateValidation);
router.delete('/:id', authMiddleware, deleteValidation);
router.post('/test', authMiddleware, testValidation);

module.exports = router;
