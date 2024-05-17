/* eslint-disable indent */
/**
 * Author:          Andy Jones - Department for Education
 * Description:     Routes for the application
 * GitHub Issue:    https://github.com/DFE-Digital/design
 */

// DEPENDENCIES //
const express = require('express')
const router = express.Router()

// CONTROLLERS //
const feedbackController = require('./controllers/feedbackController.js')


// Feedback
router.post('/form-response/helpful', feedbackController.post_helpful)
router.post('/form-response/feedback', feedbackController.post_feedback)


module.exports = router
