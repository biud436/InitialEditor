var express = require('express');
var router = express.Router();
var cors = require('cors');

/* GET home page. */
router.get('/', cors(), function(req, res, next) {
  res.render('index', { title: 'Initial Editor' });
});

module.exports = router;
