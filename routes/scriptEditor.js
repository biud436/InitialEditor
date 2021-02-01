const express = require('express');
const router = express.Router();
const cors = require('cors');
const path = require('path');

/* GET home page. */
router.get('/', cors(), function(req, res, next) {
  req.app.render('scriptEditor', { title: 'Initial Editor' }, (err, html) => {
      res.sendFile(path.join(__dirname + '/../public/index.html'))
      res.end(html);
  });
});

module.exports = router;
