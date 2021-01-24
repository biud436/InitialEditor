var express = require('express');
var router = express.Router();
var cors = require('cors');

/* GET home page. */
router.get('/', cors(), function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');  
  res.render('index', { title: 'Initial Editor' });
});

module.exports = router;
