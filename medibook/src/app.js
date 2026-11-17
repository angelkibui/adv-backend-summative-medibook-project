// REST API map. Resources are plural nouns; nested/specialised reads live
// under the resource they describe.
const express = require('express');
const patientController = require('../controllers/patientController');
const doctorController = require('../controllers/doctorController');
const appointmentController = require('../controllers/appointmentController');
const reportController = require('../controllers/reportController');

const router = express.Router();

// Patients — CRUD
router.post('/patients', patientController.create);
router.get('/patients', patientController.list);
router.get('/patients/:id', patientController.getOne);
router.put('/patients/:id', patientController.update);
router.delete('/patients/:id', patientController.remove);

// Doctors — CRUD + statistics
router.post('/doctors', doctorController.create);
router.get('/doctors', doctorController.list);
router.get('/doctors/:id', doctorController.getOne);
router.put('/doctors/:id', doctorController.update);
router.delete('/doctors/:id', doctorController.remove);
router.get('/doctors/:id/stats', doctorController.stats);

// Appointments — creation IS booking, deletion IS cancellation (see README)
router.post('/appointments', appointmentController.book);
router.get('/appointments', appointmentController.list);
router.get('/appointments/:id', appointmentController.getOne);
router.delete('/appointments/:id', appointmentController.cancel);

// Reports
router.get('/reports/doctors', reportController.doctors);
router.get('/reports/busy-days', reportController.busyDays);

module.exports = router;
